// LISTINGS: SQL only. The rules (who may see or change what) are in
// lib/services/listings.ts.
//
// TWO KINDS OF QUERY, kept visibly apart:
//   PUBLIC  (publicCardColumns, getPublicListingBySlug): never name
//           address_line, lat, lng or checkin_instructions. They select
//           approx_lat()/approx_lng() (db/migrations/011) instead, so the
//           exact location isn't even in the rows the server holds while
//           rendering a public page.
//   HOST    (getHostListing, listHostListings): every column, and EVERY
//           one filters on host_id = the signed-in host. Someone else's
//           listing id finds no row, which the service turns into 404.
import 'server-only'

import { z } from 'zod'
import { one, rows, type Db } from '@/lib/db/executor'
import { empty, q, type Sql } from '@/lib/db/sql'
import { CANCELLATION_POLICIES, LISTING_STATUSES, PROPERTY_TYPES } from '@/lib/options'
import { clock, int8, isoDate, numeric } from './common'

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

/** The columns of a result card. Joined with the cover photo (position 0). */
export const publicCardColumns = q`
  l.id, l.slug, l.title, l.property_type AS "propertyType", l.bedrooms, l.bathrooms,
  l.max_guests AS "maxGuests", l.state, l.city, l.area,
  approx_lat(l.lat, l.id) AS "approxLat", approx_lng(l.lng, l.id) AS "approxLng",
  l.nightly_kobo AS "nightlyKobo", l.weekend_kobo AS "weekendKobo",
  l.cleaning_fee_kobo AS "cleaningFeeKobo", l.caution_deposit_kobo AS "cautionDepositKobo",
  l.weekly_discount_percent AS "weeklyDiscountPercent",
  l.min_nights AS "minNights", l.max_nights AS "maxNights",
  l.rating_avg AS "ratingAvg", l.rating_count AS "ratingCount",
  cover.blob_url AS "coverUrl", cover.alt_text AS "coverAlt", cover.width AS "coverWidth", cover.height AS "coverHeight"`

/** FROM + the cover join, for anything that selects publicCardColumns. */
export const publicCardFrom = q`
  FROM listings l
  LEFT JOIN listing_photos cover ON cover.listing_id = l.id AND cover.position = 0`

export const PublicCard = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  propertyType: z.enum(PROPERTY_TYPES),
  bedrooms: z.number().int(),
  bathrooms: z.number().int(),
  maxGuests: z.number().int(),
  state: z.string(),
  city: z.string(),
  area: z.string(),
  approxLat: numeric,
  approxLng: numeric,
  nightlyKobo: int8,
  weekendKobo: int8.nullable(),
  cleaningFeeKobo: int8,
  cautionDepositKobo: int8,
  weeklyDiscountPercent: z.number().int(),
  minNights: z.number().int(),
  maxNights: z.number().int(),
  ratingAvg: numeric.nullable(),
  ratingCount: z.number().int(),
  coverUrl: z.string().nullable(),
  coverAlt: z.string().nullable(),
  coverWidth: z.number().int().nullable(),
  coverHeight: z.number().int().nullable(),
})
export type PublicCard = z.infer<typeof PublicCard>

const Photo = z.object({ id: z.uuid(), url: z.string(), alt: z.string(), width: z.number().int(), height: z.number().int(), position: z.number().int() })
export type Photo = z.infer<typeof Photo>

const PublicListing = PublicCard.extend({
  description: z.string(),
  houseRules: z.string(),
  checkInTime: clock,
  checkOutTime: clock,
  cancellationPolicy: z.enum(CANCELLATION_POLICIES),
  hostId: z.uuid(),
  hostFirstName: z.string(),
  hostSince: isoDate,
  photos: z.array(Photo),
  amenities: z.array(z.string()),
  publishedAt: z.date().nullable(),
  status: z.enum(LISTING_STATUSES),
})
export type PublicListing = z.infer<typeof PublicListing>

const detailExtras = q`
  l.description, l.house_rules AS "houseRules",
  l.check_in_time::text AS "checkInTime", l.check_out_time::text AS "checkOutTime",
  l.cancellation_policy AS "cancellationPolicy", l.host_id AS "hostId",
  split_part(h.name, ' ', 1) AS "hostFirstName", (h.created_at AT TIME ZONE 'Africa/Lagos')::date::text AS "hostSince",
  coalesce((SELECT json_agg(json_build_object('id', p.id, 'url', p.blob_url, 'alt', p.alt_text, 'width', p.width, 'height', p.height, 'position', p.position) ORDER BY p.position)
            FROM listing_photos p WHERE p.listing_id = l.id), '[]'::json) AS photos,
  coalesce((SELECT array_agg(la.amenity_code ORDER BY a.sort_order) FROM listing_amenities la JOIN amenities a ON a.code = la.amenity_code
            WHERE la.listing_id = l.id), '{}') AS amenities,
  l.published_at AS "publishedAt", l.status`

/**
 * A PUBLISHED listing by its slug, for /stays/[slug]. Only published: a
 * draft, paused or rejected listing is "not found" to the public (its host
 * previews it from /host instead).
 */
export async function getPublicListingBySlug(db: Db, slug: string): Promise<PublicListing | null> {
  return one(
    db,
    PublicListing,
    q`SELECT ${publicCardColumns}, ${detailExtras}
      ${publicCardFrom}
      JOIN users h ON h.id = l.host_id
      WHERE l.slug = ${slug} AND l.status = 'published'`,
    'getPublicListingBySlug',
  )
}

/** The same public shape by id (the quote route, the calendar feed's title). Published only. */
export async function getPublicListingById(db: Db, id: string): Promise<PublicListing | null> {
  return one(
    db,
    PublicListing,
    q`SELECT ${publicCardColumns}, ${detailExtras}
      ${publicCardFrom}
      JOIN users h ON h.id = l.host_id
      WHERE l.id = ${id} AND l.status = 'published'`,
    'getPublicListingById',
  )
}

/** A handful of published listings for the home page: best first. */
export async function listFeatured(db: Db, limit: number): Promise<PublicCard[]> {
  return rows(
    db,
    PublicCard,
    q`SELECT ${publicCardColumns} ${publicCardFrom}
      WHERE l.status = 'published'
      ORDER BY l.recommended_score DESC, l.id DESC LIMIT ${limit}`,
    'listFeatured',
  )
}

/** Areas with published listings, and how many: the home page's "Where to?" grid. */
export async function listAreas(db: Db): Promise<{ area: string; city: string; state: string; count: number }[]> {
  return rows(
    db,
    z.object({ area: z.string(), city: z.string(), state: z.string(), count: z.coerce.number().int() }),
    q`SELECT area, city, state, count(*)::int AS count FROM listings
      WHERE status = 'published' GROUP BY area, city, state ORDER BY count DESC, area`,
    'listAreas',
  )
}

export async function listAmenities(db: Db): Promise<{ code: string; label: string; grp: string }[]> {
  return rows(
    db,
    z.object({ code: z.string(), label: z.string(), grp: z.string() }),
    q`SELECT code, label, grp FROM amenities ORDER BY sort_order`,
    'listAmenities',
  )
}

/** The price rules that touch [from, to): for quotes (lib/pricing.ts). */
export async function listPriceRules(db: Db, listingId: string, from: string, to: string) {
  return rows(
    db,
    z.object({ id: z.uuid(), start: isoDate, end: isoDate, nightlyKobo: int8, label: z.string() }),
    q`SELECT id, lower(nights)::text AS start, upper(nights)::text AS "end", nightly_kobo AS "nightlyKobo", label
      FROM price_rules WHERE listing_id = ${listingId} AND nights && daterange(${from}::date, ${to}::date)
      ORDER BY lower(nights)`,
    'listPriceRules',
  )
}

// ---------------------------------------------------------------------------
// Host (always WHERE host_id = the signed-in host)
// ---------------------------------------------------------------------------

export const HostListing = z.object({
  id: z.uuid(),
  hostId: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  propertyType: z.enum(PROPERTY_TYPES),
  bedrooms: z.number().int(),
  bathrooms: z.number().int(),
  maxGuests: z.number().int(),
  state: z.string().nullable(),
  city: z.string().nullable(),
  area: z.string().nullable(),
  addressLine: z.string().nullable(),
  lat: numeric.nullable(),
  lng: numeric.nullable(),
  nightlyKobo: int8.nullable(),
  weekendKobo: int8.nullable(),
  cleaningFeeKobo: int8,
  cautionDepositKobo: int8,
  weeklyDiscountPercent: z.number().int(),
  minNights: z.number().int(),
  maxNights: z.number().int(),
  checkInTime: clock,
  checkOutTime: clock,
  cancellationPolicy: z.enum(CANCELLATION_POLICIES),
  houseRules: z.string(),
  checkinInstructions: z.string(),
  status: z.enum(LISTING_STATUSES),
  rejectionReason: z.string().nullable(),
  ratingAvg: numeric.nullable(),
  ratingCount: z.number().int(),
  icalVersion: z.number().int(),
  version: z.number().int(),
  photoCount: z.number().int(),
  coverUrl: z.string().nullable(),
  coverAlt: z.string().nullable(),
  amenities: z.array(z.string()),
  updatedAt: z.date(),
})
export type HostListing = z.infer<typeof HostListing>

const hostColumns = q`
  l.id, l.host_id AS "hostId", l.slug, l.title, l.description, l.property_type AS "propertyType",
  l.bedrooms, l.bathrooms, l.max_guests AS "maxGuests", l.state, l.city, l.area,
  l.address_line AS "addressLine", l.lat, l.lng,
  l.nightly_kobo AS "nightlyKobo", l.weekend_kobo AS "weekendKobo", l.cleaning_fee_kobo AS "cleaningFeeKobo",
  l.caution_deposit_kobo AS "cautionDepositKobo", l.weekly_discount_percent AS "weeklyDiscountPercent",
  l.min_nights AS "minNights", l.max_nights AS "maxNights",
  l.check_in_time::text AS "checkInTime", l.check_out_time::text AS "checkOutTime",
  l.cancellation_policy AS "cancellationPolicy", l.house_rules AS "houseRules",
  l.checkin_instructions AS "checkinInstructions", l.status, l.rejection_reason AS "rejectionReason",
  l.rating_avg AS "ratingAvg", l.rating_count AS "ratingCount", l.ical_version AS "icalVersion", l.version,
  (SELECT count(*)::int FROM listing_photos p WHERE p.listing_id = l.id) AS "photoCount",
  cover.blob_url AS "coverUrl", cover.alt_text AS "coverAlt",
  coalesce((SELECT array_agg(la.amenity_code ORDER BY la.amenity_code) FROM listing_amenities la WHERE la.listing_id = l.id), '{}') AS amenities,
  l.updated_at AS "updatedAt"`

/** One of THIS host's listings, or null (missing OR someone else's: the same answer). `forUpdate` locks the row. */
export async function getHostListing(db: Db, hostId: string, listingId: string, { forUpdate = false } = {}): Promise<HostListing | null> {
  return one(
    db,
    HostListing,
    q`SELECT ${hostColumns}
      FROM listings l LEFT JOIN listing_photos cover ON cover.listing_id = l.id AND cover.position = 0
      WHERE l.id = ${listingId} AND l.host_id = ${hostId}
      ${forUpdate ? q`FOR UPDATE OF l` : empty}`,
    'getHostListing',
  )
}

/** Any listing by id, for an admin. */
export async function getListingForAdmin(db: Db, listingId: string): Promise<HostListing | null> {
  return one(
    db,
    HostListing,
    q`SELECT ${hostColumns}
      FROM listings l LEFT JOIN listing_photos cover ON cover.listing_id = l.id AND cover.position = 0
      WHERE l.id = ${listingId}`,
    'getListingForAdmin',
  )
}

export async function listHostListings(db: Db, hostId: string): Promise<HostListing[]> {
  return rows(
    db,
    HostListing,
    q`SELECT ${hostColumns}
      FROM listings l LEFT JOIN listing_photos cover ON cover.listing_id = l.id AND cover.position = 0
      WHERE l.host_id = ${hostId}
      ORDER BY (l.status = 'archived'), l.updated_at DESC`,
    'listHostListings',
  )
}

/** A new draft: only the basics step's fields. Returns the id, or null when the slug is taken (the service retries). */
export async function insertDraft(
  db: Db,
  hostId: string,
  input: { slug: string; title: string; description: string; propertyType: string; bedrooms: number; bathrooms: number; maxGuests: number },
): Promise<string | null> {
  const result = await rows(
    db,
    z.object({ id: z.uuid() }),
    q`INSERT INTO listings (host_id, slug, title, description, property_type, bedrooms, bathrooms, max_guests)
      VALUES (${hostId}, ${input.slug}, ${input.title}, ${input.description}, ${input.propertyType}, ${input.bedrooms}, ${input.bathrooms}, ${input.maxGuests})
      ON CONFLICT (slug) DO NOTHING
      RETURNING id`,
    'insertDraft',
  )
  return result[0]?.id ?? null
}

/**
 * Saves one step of the form: only the columns that step owns, and only if
 * the row is still at `version` (OPTIMISTIC CONCURRENCY: two tabs editing
 * the same listing can't silently overwrite each other; the second save
 * finds version 5 where it expected 4 and changes nothing). Returns the
 * new version, or null if the version was stale or the listing isn't this
 * host's.
 */
export async function updateListingFields(db: Db, hostId: string, listingId: string, version: number, set: Sql): Promise<number | null> {
  const result = await rows(
    db,
    z.object({ version: z.number().int() }),
    q`UPDATE listings SET ${set}, version = version + 1
      WHERE id = ${listingId} AND host_id = ${hostId} AND version = ${version} AND status <> 'archived'
      RETURNING version`,
    'updateListingFields',
  )
  return result[0]?.version ?? null
}

/** Replaces a listing's amenities (inside the step's transaction). */
export async function replaceAmenities(db: Db, listingId: string, codes: string[]): Promise<void> {
  await db.query(q`DELETE FROM listing_amenities WHERE listing_id = ${listingId}`)
  if (codes.length > 0) {
    await db.query(q`INSERT INTO listing_amenities (listing_id, amenity_code)
      SELECT ${listingId}, code FROM amenities WHERE code = ANY(${codes}::text[])`)
  }
}

/** A guarded status change: only from one of `from`. Returns whether it happened. */
export async function setStatus(
  db: Db,
  listingId: string,
  from: readonly string[],
  to: string,
  extra: Sql = empty,
  hostId: string | null = null,
): Promise<boolean> {
  const result = await db.query(q`
    UPDATE listings SET status = ${to} ${extra}, version = version + 1
    WHERE id = ${listingId} AND status = ANY(${from as string[]}::text[])
      ${hostId ? q`AND host_id = ${hostId}` : empty}
    RETURNING id`)
  return result.length > 0
}

/** Drafts with no stays may be deleted outright (photos and amenities CASCADE). */
export async function deleteDraft(db: Db, hostId: string, listingId: string): Promise<boolean> {
  const result = await db.query(q`DELETE FROM listings WHERE id = ${listingId} AND host_id = ${hostId} AND status = 'draft' RETURNING id`)
  return result.length > 0
}

/**
 * Recomputes the cached rating columns from the reviews table: the truth.
 * Run in the same transaction as each review insert, and by the daily cron.
 * recommended_score is a Bayesian average: (sum + 3 × 4.0) / (count + 3).
 */
export async function refreshRating(db: Db, listingId: string | null): Promise<number> {
  const result = await db.query(q`
    UPDATE listings l SET
      rating_avg = agg.avg, rating_count = agg.count,
      recommended_score = round((agg.sum + 12.0) / (agg.count + 3), 3)
    FROM (
      SELECT l2.id, round(avg(r.overall), 2) AS avg, count(r.id)::int AS count, coalesce(sum(r.overall), 0) AS sum
      FROM listings l2 LEFT JOIN reviews r ON r.listing_id = l2.id
      WHERE ${listingId}::uuid IS NULL OR l2.id = ${listingId}::uuid
      GROUP BY l2.id
    ) agg
    WHERE l.id = agg.id
      AND (l.rating_avg IS DISTINCT FROM agg.avg OR l.rating_count <> agg.count)
    RETURNING l.id`)
  return result.length
}
