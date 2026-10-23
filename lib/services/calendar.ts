// THE HOST'S CALENDAR: blocking nights, special prices, the dashboard
// numbers and the iCal feed.
//
// A BLOCK IS A STAY (kind 'host_block') in the same table as bookings, so
// the SAME exclusion constraint protects both: a block can't be put on a
// booked night, a booking can't land on a blocked one, and two blocks can't
// overlap. The database refuses with 23P01 and we explain it.
import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { isExclusionError, isReferencedError } from '@/lib/db/errors'
import { http } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { withTransaction } from '@/lib/db/tx'
import * as hostRepo from '@/lib/repos/host'
import * as listingsRepo from '@/lib/repos/listings'
import * as staysRepo from '@/lib/repos/stays'
import { addDays, addMonths, todayInLagos } from '@/lib/time'
import { requireHost, type Actor } from './actor'
import { conflict, invalid, notFound } from './errors'

async function myListing(actor: Actor, listingId: string, write: boolean) {
  const host = requireHost(actor, { write })
  const listing = /^[0-9a-f-]{36}$/i.test(listingId) ? await listingsRepo.getHostListing(http, host.id, listingId) : null
  if (!listing) throw notFound('Listing')
  return { host, listing }
}

/** The month view's data: occupying stays (guests' FIRST names only) for a month and its neighbours. */
export async function getCalendar(actor: Actor, listingId: string, month: string) {
  const { host, listing } = await myListing(actor, listingId, false)
  await staysRepo.expireStaleHolds(http, { listingId })
  const from = `${addMonths(month, -1)}-01`
  const to = `${addMonths(month, 2)}-01`
  const [stays, rules] = await Promise.all([staysRepo.hostCalendar(http, host.id, listingId, from, to), hostRepo.listPriceRules(http, host.id, listingId)])
  // The shared demo host's guests are other visitors: initials only.
  const shown = host.isDemo ? stays.map((s) => ({ ...s, guestFirstName: s.guestFirstName ? `${s.guestFirstName[0]}.` : null })) : stays
  return { listing, stays: shown, rules, today: todayInLagos() }
}

function nightsRange(first: string, last: string): { start: string; end: string } {
  const today = todayInLagos()
  if (first < today) throw invalid('past', 'You can only change nights from today on.')
  if (first > `${addMonths(today.slice(0, 7), 18)}-01`) throw invalid('too_far', 'That’s too far ahead to change.')
  return { start: first, end: addDays(last, 1) }
}

/** Block [first, last] (both nights included). Refused if any of those nights is booked or already blocked. */
export async function blockNights(actor: Actor, listingId: string, first: string, last: string, note: string | null): Promise<void> {
  const { host } = await myListing(actor, listingId, true)
  const { start, end } = nightsRange(first, last)
  try {
    await staysRepo.insertBlock(http, host.id, listingId, start, end, note)
  } catch (error) {
    if (isExclusionError(error, 'stays_no_overlap')) throw conflict('nights_taken', 'Some of those nights are already booked or blocked. Choose only free nights.')
    // Layer 2 of ownership: the composite FK refused a listing that isn't this host's.
    if (isReferencedError(error)) throw notFound('Listing')
    throw error
  }
}

/** Unblock [first, last]: blocks are trimmed or split around the range (bookings are never touched). */
export async function unblockNights(actor: Actor, listingId: string, first: string, last: string): Promise<number> {
  const { host } = await myListing(actor, listingId, true)
  const { start, end } = nightsRange(first, last)
  return withTransaction((tx) => staysRepo.unblockRange(tx, host.id, listingId, start, end))
}

export async function addPriceRule(actor: Actor, listingId: string, first: string, last: string, nightlyKobo: number, label: string): Promise<void> {
  const { host } = await myListing(actor, listingId, true)
  const { start, end } = nightsRange(first, last)
  try {
    await hostRepo.insertPriceRule(http, { hostId: host.id, listingId, start, end, nightlyKobo, label })
  } catch (error) {
    if (isExclusionError(error, 'price_rules_no_overlap')) throw conflict('rule_overlap', 'Those nights already have a special price. Remove it first.')
    throw error
  }
}

export async function removePriceRule(actor: Actor, listingId: string, ruleId: string): Promise<void> {
  const { host } = await myListing(actor, listingId, true)
  if (!(await hostRepo.deletePriceRule(http, host.id, ruleId))) throw notFound('Price rule')
}

export async function getDashboard(actor: Actor) {
  const host = requireHost(actor, { write: false })
  await staysRepo.completeFinishedStays(http, { hostId: host.id })
  const [occupancy, money] = await Promise.all([hostRepo.occupancyThisMonth(http, host.id), hostRepo.earnings(http, host.id)])
  return { occupancy, money }
}

// ---------------------------------------------------------------------------
// The iCal feed
// ---------------------------------------------------------------------------

/**
 * WHY THE FEED NEEDS A SECRET TOKEN. Calendar apps (Google Calendar, other
 * booking sites) fetch an .ics URL with no cookie and no login, so the URL
 * itself is the only credential. Without a secret, anyone who guessed a
 * listing id could watch when a flat is empty: exactly what a burglar wants.
 * The token is an HMAC of the listing id and its ical_version, keyed with
 * ICAL_SIGNING_SECRET: it can't be forged without the secret, it's checked
 * without storing anything, and "Reset link" (bumping ical_version) kills
 * every old URL at once. The feed itself shows only busy dates: no names.
 */
function icalSecret(): string {
  const secret = process.env.ICAL_SIGNING_SECRET
  if (!secret || secret.length < 32) throw new Error('ICAL_SIGNING_SECRET must be set (at least 32 characters).')
  return secret
}

export function icalToken(listingId: string, version: number): string {
  return createHmac('sha256', icalSecret()).update(`ical:${listingId}:${version}`).digest('base64url')
}

export async function icalUrlFor(actor: Actor, listingId: string): Promise<string> {
  const { listing } = await myListing(actor, listingId, false)
  return `/api/listings/${listing.id}/calendar.ics?token=${icalToken(listing.id, listing.icalVersion)}`
}

/** Rotates the feed's token: every old link stops working. */
export async function resetIcalLink(actor: Actor, listingId: string): Promise<void> {
  const { host } = await myListing(actor, listingId, true)
  await http.query(q`UPDATE listings SET ical_version = ical_version + 1 WHERE id = ${listingId} AND host_id = ${host.id}`)
}

function escapeIcs(text: string): string {
  return text.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')
}

/** The .ics text for a listing, if the token is right; null otherwise (the route answers 404 either way). */
export async function icalFeed(listingId: string, token: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(listingId) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const rows = await http.query(q`SELECT title, ical_version FROM listings WHERE id = ${listingId} AND status <> 'archived'`)
  const row = rows[0]
  if (!row) return null
  const expected = Buffer.from(icalToken(listingId, Number(row.ical_version)))
  const given = Buffer.from(token)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  const ranges = await staysRepo.feedRanges(http, listingId)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Staybook//Availability//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcs(`Staybook: ${String(row.title)}`)}`,
    ...ranges.flatMap((r) => [
      'BEGIN:VEVENT',
      `UID:${r.id}@staybook`,
      `DTSTAMP:${stamp}`,
      // All-day dates: DTEND is the check-out day, exclusive, exactly like '[)'.
      `DTSTART;VALUE=DATE:${r.start.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${r.end.replace(/-/g, '')}`,
      `SUMMARY:${r.kind === 'booking' ? 'Booked' : 'Not available'}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ]
  // iCalendar wants CRLF line endings.
  return `${lines.join('\r\n')}\r\n`
}
