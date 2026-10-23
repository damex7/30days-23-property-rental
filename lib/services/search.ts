// SEARCH: the rules between the URL and the one SQL query.
//
// The page parses the URL with Zod (lib/schemas.ts searchParamsSchema),
// where every field already falls back on its own. This file applies the
// rules that involve two fields or "today", says what it IGNORED and why
// (shown above the results, so a bad link is explained, not silently
// "fixed"), then calls the repo once and prices each card for the dates.
import 'server-only'

import { http } from '@/lib/db/executor'
import { decodeCursor, encodeCursor, type Page } from '@/lib/pagination'
import { quoteStay, type Quote } from '@/lib/pricing'
import * as listingsRepo from '@/lib/repos/listings'
import * as repo from '@/lib/repos/search'
import type { SearchParams } from '@/lib/schemas'
import { dateProblem } from '@/lib/booking-rules'
import type { PropertyType, Sort } from '@/lib/options'
import { addDays, daysBetween, todayInLagos } from '@/lib/time'
import type { Actor } from './actor'
import { isServiceError } from './errors'

export const PAGE_SIZE = 12

/**
 * ABBREVIATIONS people really type. Trigram similarity can't know that "VI"
 * means Victoria Island (they share no letters in order), so a few common
 * ones are expanded first. Whole-query aliases for the city-level ones, so
 * "PH" (Port Harcourt) doesn't collide with the "ph" in "Lekki ph1".
 */
const WHOLE_ALIASES: Record<string, string> = {
  vi: 'victoria island',
  'v.i': 'victoria island',
  'v.i.': 'victoria island',
  ph: 'port harcourt',
  'p.h': 'port harcourt',
  phc: 'port harcourt',
  abj: 'abuja',
  'lekki 1': 'lekki phase 1',
}
const WORD_ALIASES: Record<string, string> = { ph1: 'phase 1', ph2: 'phase 2', 'ph.1': 'phase 1', vgc: 'victoria garden city' }

export function normaliseWhere(raw: string): string {
  const text = raw.toLowerCase().replace(/\s+/g, ' ').trim()
  if (WHOLE_ALIASES[text]) return WHOLE_ALIASES[text]
  return text
    .split(' ')
    .map((word) => WORD_ALIASES[word] ?? word)
    .join(' ')
}

export type SearchFilters = {
  where: string | null
  checkIn: string | null
  checkOut: string | null
  nights: number | null
  guests: number | null
  minNaira: number | null
  maxNaira: number | null
  type: PropertyType | null
  bedrooms: number | null
  amenities: string[]
  bbox: repo.BBox | null
  sort: Sort
}

export type SearchCard = listingsRepo.PublicCard & { saved: boolean; quote: Quote | null }

export type SearchResult = Page<SearchCard> & {
  filters: SearchFilters
  /** Only known on the first page (it's a window count over every match). */
  total: number | null
  /** "We ignored the dates because…": shown above the results. */
  notes: string[]
  /** "Did you mean Lekki Phase 1?" when a place matched nothing. */
  suggestion: { place: string; city: string } | null
  /** The cursor didn't fit this search (an edited URL): we started from the top. */
  restarted: boolean
}

/** Applies the cross-field rules. Pure apart from "today", so the page and the check script agree. */
export function resolveFilters(params: SearchParams, knownAmenities: ReadonlySet<string>, today = todayInLagos()): { filters: SearchFilters; notes: string[] } {
  const notes: string[] = []
  let checkIn = params.checkin ?? null
  let checkOut = params.checkout ?? null
  if ((checkIn && !checkOut) || (!checkIn && checkOut)) {
    notes.push('Choose both a check-in and a check-out date to see which places are free.')
    checkIn = checkOut = null
  } else if (checkIn && checkOut) {
    const problem = dateProblem({ checkIn, checkOut, today })
    if (!problem) return finish(checkIn, checkOut, daysBetween(checkIn, checkOut))
    notes.push(`We ignored the dates: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}`)
    checkIn = checkOut = null
  }
  return finish(null, null, null)

  function finish(inDate: string | null, outDate: string | null, nights: number | null) {
    let min = params.min ?? null
    let max = params.max ?? null
    if (min !== null && max !== null && min > max) {
      ;[min, max] = [max, min]
      notes.push('The minimum price was above the maximum, so we swapped them.')
    }
    const amenities = (params.amenities ?? []).filter((code) => knownAmenities.has(code))
    if ((params.amenities ?? []).length > amenities.length) notes.push('Some amenities in the link aren’t ones we know, so we left them out.')
    return {
      notes,
      filters: {
        where: params.where ? normaliseWhere(params.where) : null,
        checkIn: inDate,
        checkOut: outDate,
        nights,
        guests: params.guests ?? null,
        minNaira: min,
        maxNaira: max,
        type: params.type ?? null,
        bedrooms: params.bedrooms ?? null,
        amenities,
        bbox: params.bbox ?? null,
        sort: params.sort,
      },
    }
  }
}

/** The filters that shape the result set (not the sort or page): a cursor is only valid for the same ones. */
function fingerprintOf(f: SearchFilters): Record<string, unknown> {
  return { ...f, sort: undefined, amenities: [...f.amenities].sort().join(',') }
}

export async function searchStays(actor: Actor, params: SearchParams): Promise<SearchResult> {
  const amenityRows = await listingsRepo.listAmenities(http)
  const { filters, notes } = resolveFilters(params, new Set(amenityRows.map((a) => a.code)))

  let after: [string, string] | null = null
  let restarted = false
  if (params.cursor) {
    try {
      const key = decodeCursor(params.cursor, filters.sort, fingerprintOf(filters))
      if (key.length === 2 && typeof key[0] === 'string' && typeof key[1] === 'string') after = [key[0], key[1]]
      else restarted = true
    } catch (error) {
      if (!isServiceError(error)) throw error
      restarted = true
    }
  }

  const rows = await repo.searchListings(http, {
    where: filters.where,
    checkIn: filters.checkIn,
    checkOut: filters.checkOut,
    nights: filters.nights,
    guests: filters.guests,
    minKobo: filters.minNaira === null ? null : filters.minNaira * 100,
    maxKobo: filters.maxNaira === null ? null : filters.maxNaira * 100,
    type: filters.type,
    bedrooms: filters.bedrooms,
    amenities: filters.amenities,
    bbox: filters.bbox,
    sort: filters.sort,
    after,
    limit: PAGE_SIZE,
    viewerId: actor?.id ?? null,
  })

  const page = rows.slice(0, PAGE_SIZE)
  const last = page[page.length - 1]
  const nextCursor = rows.length > PAGE_SIZE && last ? encodeCursor(filters.sort, fingerprintOf(filters), [last.sortKey, last.id]) : null

  const items: SearchCard[] = page.map(({ sortKey: _sortKey, totalCount: _totalCount, priceRules, saved, ...card }) => ({
    ...card,
    saved,
    // THE TOTAL FOR YOUR DATES on every card, from the same pricing
    // function Reserve uses, so the card and the checkout always agree.
    quote: filters.checkIn && filters.checkOut ? quoteStay(card, filters.checkIn, filters.checkOut, priceRules ?? []) : null,
  }))

  const total = after ? null : (rows[0]?.totalCount ?? 0)
  // "Did you mean" only when the PLACE matched nothing at all; if it matched
  // but the dates or filters ruled everything out, the empty state offers
  // to remove a filter instead.
  const suggestion = total === 0 && filters.where && !(await repo.placeMatchesAnything(http, filters.where)) ? await repo.closestPlace(http, filters.where) : null
  return { items, nextCursor, filters, total, notes, suggestion: suggestion && suggestion.place.toLowerCase() !== filters.where ? suggestion : null, restarted }
}

/** A week from today for three nights, in Lagos: the dates the home page's search box suggests. */
export function suggestedDates(today = todayInLagos()): { checkIn: string; checkOut: string } {
  return { checkIn: addDays(today, 7), checkOut: addDays(today, 10) }
}
