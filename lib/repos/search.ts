// SEARCH: one request becomes ONE SQL query (README, diagram 3).
//
// Each filter the visitor set becomes a small parameterised FRAGMENT
// (lib/db/sql.ts), and the fragments are joined with AND. Nothing the
// visitor typed is ever pasted into the SQL text: "lekki' OR 1=1 --" is
// sent as a VALUE ($3) and searched for as the words it is. The only parts
// chosen by the code, not the input, are WHOLE fragments written below: the
// sort column and direction come from the SORTS table, never from the URL.
//
// Which index serves which part (EXPLAIN ANALYZE output in the README):
//   status = 'published'          every index below is PARTIAL on it
//   "where" full-text             listings_search_idx (GIN on the tsvector)
//   "where" fuzzy (Leki, VI)      listings_area_trgm_idx / city (GIN trigram)
//   amenities ALL                 listing_amenities_code_idx
//   map box                       listings_pub_approx_geo_idx (expression)
//   dates: NOT EXISTS (... &&)    the GiST index of stays_no_overlap
//   ORDER BY + cursor             listings_pub_{price,newest,rating,recommended}_idx
import 'server-only'

import { z } from 'zod'
import { rows, type Db } from '@/lib/db/executor'
import { empty, join, q, type Sql } from '@/lib/db/sql'
import type { PropertyType, Sort } from '@/lib/options'
import { int8, isoDate, numeric } from './common'
import { PublicCard, publicCardColumns, publicCardFrom } from './listings'
import { OCCUPYING } from './stays'

export type BBox = { south: number; west: number; north: number; east: number }

export type SearchQuery = {
  /** Already normalised by the service ("lekki ph1" → "lekki phase 1"). */
  where: string | null
  checkIn: string | null
  checkOut: string | null
  nights: number | null
  guests: number | null
  minKobo: number | null
  maxKobo: number | null
  type: PropertyType | null
  bedrooms: number | null
  amenities: string[]
  bbox: BBox | null
  sort: Sort
  /** The last row of the previous page: [sort key as text, id]. */
  after: [string, string] | null
  limit: number
  /** Marks each card saved (the heart) for this user; null for visitors. */
  viewerId: string | null
}

/**
 * THE SORTS. Each is a key expression, a direction and the type to cast the
 * cursor's key back to. The id is ALWAYS the last key: two listings can
 * share a price, and without a tie-breaker the order between them isn't
 * fixed, so a listing could appear on both page 1 and page 2, or on neither.
 * The expressions match the partial indexes in 007 exactly, so PostgreSQL
 * can walk the index in order and stop after `limit` rows.
 */
const SORT_SPECS: Record<Sort, { key: Sql; keyText: Sql; desc: boolean; cast: Sql }> = {
  recommended: { key: q`l.recommended_score`, keyText: q`l.recommended_score::text`, desc: true, cast: q`numeric` },
  price_asc: { key: q`l.nightly_kobo`, keyText: q`l.nightly_kobo::text`, desc: false, cast: q`bigint` },
  price_desc: { key: q`l.nightly_kobo`, keyText: q`l.nightly_kobo::text`, desc: true, cast: q`bigint` },
  rating: { key: q`coalesce(l.rating_avg, 0)`, keyText: q`coalesce(l.rating_avg, 0)::text`, desc: true, cast: q`numeric` },
  newest: { key: q`l.published_at`, keyText: q`to_char(l.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`, desc: true, cast: q`timestamptz` },
}

const SearchRow = PublicCard.extend({
  sortKey: z.string(),
  totalCount: z.coerce.number().int().nullable(),
  saved: z.boolean(),
  priceRules: z.array(z.object({ start: isoDate, end: isoDate, nightlyKobo: int8, label: z.string() })).nullable(),
})
export type SearchRow = z.infer<typeof SearchRow>

/** Builds the WHERE fragments, one per active filter. Exported so the EXPLAIN script runs the very same SQL. */
export function searchConditions(f: SearchQuery): Sql[] {
  const where: Sql[] = [q`l.status = 'published'`]

  if (f.where) {
    // FULL-TEXT for whole words anywhere in title, area, city or description
    // (both dictionaries: 'english' stems "apartments" to match the
    // description, 'simple' keeps place names whole), OR TRIGRAM WORD
    // SIMILARITY on the area and city for misspellings and fragments: "Leki"
    // <% "Lekki Phase 1" asks "is 'leki' close to some WORD-ish part of the
    // area?" (word_similarity ≥ 0.6), which a short typed word needs; plain
    // similarity() would compare it with the whole long name and fail.
    where.push(q`(
      l.search @@ (websearch_to_tsquery('english', ${f.where}) || websearch_to_tsquery('simple', ${f.where}))
      OR ${f.where} <% l.area
      OR ${f.where} <% l.city
    )`)
  }

  if (f.checkIn && f.checkOut && f.nights) {
    // AVAILABILITY: free on EVERY requested night. NOT EXISTS stops at the
    // first clash it finds, and && on the '[)' daterange means a stay that
    // checks out on our check-in day is NOT a clash. The GiST index of the
    // exclusion constraint answers "stays of this listing overlapping
    // these nights" directly.
    where.push(q`${f.nights} BETWEEN l.min_nights AND l.max_nights`)
    where.push(q`NOT EXISTS (
      SELECT 1 FROM stays s
      WHERE s.listing_id = l.id AND ${OCCUPYING}
        AND s.nights && daterange(${f.checkIn}::date, ${f.checkOut}::date, '[)')
    )`)
  }

  if (f.guests) where.push(q`l.max_guests >= ${f.guests}`)
  if (f.minKobo !== null) where.push(q`l.nightly_kobo >= ${f.minKobo}`)
  if (f.maxKobo !== null) where.push(q`l.nightly_kobo <= ${f.maxKobo}`)
  if (f.type) where.push(q`l.property_type = ${f.type}`)
  if (f.bedrooms) where.push(q`l.bedrooms >= ${f.bedrooms}`)

  if (f.amenities.length > 0) {
    // "HAS ALL OF": the listings with one row per requested amenity. A
    // listing with wifi and parking but no generator has count 2, not 3.
    where.push(q`l.id IN (
      SELECT la.listing_id FROM listing_amenities la
      WHERE la.amenity_code = ANY(${f.amenities}::text[])
      GROUP BY la.listing_id
      HAVING count(*) = ${f.amenities.length}
    )`)
  }

  if (f.bbox) {
    // The map box, on the APPROXIMATE coordinates (db/migrations/011
    // explains why the exact ones must never be searchable).
    where.push(q`approx_lat(l.lat, l.id) BETWEEN ${f.bbox.south} AND ${f.bbox.north}`)
    where.push(q`approx_lng(l.lng, l.id) BETWEEN ${f.bbox.west} AND ${f.bbox.east}`)
  }

  return where
}

/** Keyset: rows strictly AFTER the previous page's last row, in this sort's direction. */
function cursorCondition(f: SearchQuery): Sql {
  if (!f.after) return empty
  const spec = SORT_SPECS[f.sort]
  const [key, id] = f.after
  // (key, id) > (k, i) for ascending; < for descending. A ROW comparison:
  // "key bigger, or key equal and id bigger", in one indexable expression.
  return spec.desc
    ? q`AND (${spec.key}, l.id) < (${key}::${spec.cast}, ${id}::uuid)`
    : q`AND (${spec.key}, l.id) > (${key}::${spec.cast}, ${id}::uuid)`
}

/** THE ONE QUERY. Returns limit + 1 rows: the extra one only says "there's a next page". */
export function searchSql(f: SearchQuery): Sql {
  const spec = SORT_SPECS[f.sort]
  const order = spec.desc ? q`${spec.key} DESC, l.id DESC` : q`${spec.key} ASC, l.id ASC`
  const dates = f.checkIn && f.checkOut
  return q`
    SELECT ${publicCardColumns},
      ${spec.keyText} AS "sortKey",
      -- The total number of matches, for "24 stays" and the screen reader
      -- announcement. Only on the FIRST page: a window count has to visit
      -- every match, and later pages only need "is there more?".
      ${f.after ? q`NULL::int` : q`count(*) OVER ()`} AS "totalCount",
      ${f.viewerId ? q`EXISTS (SELECT 1 FROM saved_listings sl WHERE sl.user_id = ${f.viewerId} AND sl.listing_id = l.id)` : q`false`} AS saved,
      -- With dates: this listing's special prices touching those nights, so
      -- each card's TOTAL is worked out by lib/pricing.ts without another query.
      ${dates
        ? q`(SELECT coalesce(json_agg(json_build_object('start', lower(r.nights)::text, 'end', upper(r.nights)::text, 'nightlyKobo', r.nightly_kobo, 'label', r.label)), '[]'::json)
             FROM price_rules r WHERE r.listing_id = l.id AND r.nights && daterange(${f.checkIn}::date, ${f.checkOut}::date))`
        : q`NULL::json`} AS "priceRules"
    ${publicCardFrom}
    WHERE ${join(searchConditions(f), ' AND ')}
    ${cursorCondition(f)}
    ORDER BY ${order}
    LIMIT ${f.limit + 1}`
}

export async function searchListings(db: Db, f: SearchQuery): Promise<SearchRow[]> {
  return rows(db, SearchRow, searchSql(f), 'searchListings')
}

/**
 * "DID YOU MEAN?": only asked when a search with a place found nothing.
 * The published area (or city) most similar to what was typed, if it's at
 * least a little similar (similarity > 0.2).
 */
export async function closestPlace(db: Db, where: string): Promise<{ place: string; city: string } | null> {
  const result = await rows(
    db,
    z.object({ place: z.string(), city: z.string(), score: numeric }),
    q`SELECT place, city, score FROM (
        SELECT DISTINCT l.area AS place, l.city, greatest(similarity(l.area, ${where}), word_similarity(${where}, l.area)) AS score
        FROM listings l WHERE l.status = 'published'
        UNION
        SELECT DISTINCT l.city, l.city, greatest(similarity(l.city, ${where}), word_similarity(${where}, l.city))
        FROM listings l WHERE l.status = 'published'
      ) candidates
      WHERE score > 0.2
      ORDER BY score DESC, place
      LIMIT 1`,
    'closestPlace',
  )
  const best = result[0]
  return best ? { place: best.place, city: best.city } : null
}
