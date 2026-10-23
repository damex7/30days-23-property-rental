// STAYS: SQL only (bookings and host blocks; db/migrations/008). The rules
// are in lib/services/bookings.ts, availability.ts and calendar.ts.
import 'server-only'

import { z } from 'zod'
import { one, rows, type Db } from '@/lib/db/executor'
import { empty, q } from '@/lib/db/sql'
import { CANCELLATION_POLICIES, STAY_STATUSES } from '@/lib/options'
import { clock, int8, isoDate } from './common'

/**
 * A stay (aliased s) OCCUPIES its nights when it's confirmed, or held and
 * not yet past its expiry. READS use this, so a hold that ran out a minute
 * ago and hasn't been swept yet already shows as free. (The constraint
 * can't say "not expired", which is why Reserve sweeps before inserting.)
 */
export const OCCUPYING = q`(s.status = 'confirmed' OR (s.status = 'held' AND s.hold_expires_at > now()))`

// ---------------------------------------------------------------------------
// The sweeps (lazy and cron). Each is ONE idempotent statement: running it
// twice changes nothing the second time.
// ---------------------------------------------------------------------------

/**
 * Marks holds past their 15 minutes as 'expired' (freeing their nights for
 * the exclusion constraint) and their unpaid payments as 'abandoned'.
 * Scoped to one listing (inside Reserve), one guest (their trips page), or
 * everything (the cron).
 */
export async function expireStaleHolds(db: Db, scope: { listingId?: string; guestId?: string } = {}): Promise<number> {
  const result = await rows(
    db,
    z.object({ count: z.number().int() }),
    q`WITH expired AS (
        UPDATE stays SET status = 'expired'
        WHERE status = 'held' AND hold_expires_at <= now()
          ${scope.listingId ? q`AND listing_id = ${scope.listingId}` : empty}
          ${scope.guestId ? q`AND guest_id = ${scope.guestId}` : empty}
        RETURNING id
      ), abandoned AS (
        UPDATE payments SET status = 'abandoned'
        WHERE status = 'initialized' AND stay_id IN (SELECT id FROM expired)
        RETURNING 1
      )
      SELECT (SELECT count(*) FROM expired)::int AS count`,
    'expireStaleHolds',
  )
  return result[0]?.count ?? 0
}

/** Confirmed bookings whose check-out date has passed in Lagos become 'completed' (the day after check-out). */
export async function completeFinishedStays(db: Db, scope: { guestId?: string; hostId?: string } = {}): Promise<number> {
  const result = await db.query(q`
    UPDATE stays SET status = 'completed', completed_at = now()
    WHERE status = 'confirmed' AND kind = 'booking'
      AND upper(nights) < (now() AT TIME ZONE 'Africa/Lagos')::date
      ${scope.guestId ? q`AND guest_id = ${scope.guestId}` : empty}
      ${scope.hostId ? q`AND host_id = ${scope.hostId}` : empty}
    RETURNING id`)
  return result.length
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

const BusyRange = z.object({ start: isoDate, end: isoDate, kind: z.enum(['booking', 'host_block']) })
export type BusyRange = z.infer<typeof BusyRange>

/**
 * The occupied nights of a listing between two dates, for the guest's date
 * picker. Only ranges and whether it's a booking or a block: no names, no
 * ids, nothing about who.
 */
export async function busyRanges(db: Db, listingId: string, from: string, to: string): Promise<BusyRange[]> {
  return rows(
    db,
    BusyRange,
    q`SELECT lower(s.nights)::text AS start, upper(s.nights)::text AS "end", s.kind
      FROM stays s
      WHERE s.listing_id = ${listingId} AND ${OCCUPYING}
        AND s.nights && daterange(${from}::date, ${to}::date)
      ORDER BY lower(s.nights)`,
    'busyRanges',
  )
}

/** Is any night of [checkIn, checkOut) occupied? (A friendly pre-check; the constraint is the real guard.) */
export async function isRangeBusy(db: Db, listingId: string, checkIn: string, checkOut: string): Promise<boolean> {
  const result = await db.query(q`
    SELECT 1 FROM stays s
    WHERE s.listing_id = ${listingId} AND ${OCCUPYING} AND s.nights && daterange(${checkIn}::date, ${checkOut}::date)
    LIMIT 1`)
  return result.length > 0
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

const PriceLine = z.object({ date: isoDate, kind: z.enum(['weekday', 'weekend', 'special']), kobo: z.number().int(), label: z.string().optional() })

export const StayDetail = z.object({
  id: z.uuid(),
  kind: z.enum(['booking', 'host_block']),
  listingId: z.uuid(),
  hostId: z.uuid(),
  guestId: z.uuid().nullable(),
  checkIn: isoDate,
  checkOut: isoDate,
  nightsCount: z.number().int(),
  status: z.enum(STAY_STATUSES),
  holdExpiresAt: z.date().nullable(),
  guestsCount: z.number().int().nullable(),
  priceLines: z.array(PriceLine).nullable(),
  subtotalKobo: int8.nullable(),
  discountKobo: int8.nullable(),
  cleaningFeeKobo: int8.nullable(),
  serviceFeeKobo: int8.nullable(),
  cautionDepositKobo: int8.nullable(),
  totalKobo: int8.nullable(),
  cancellationPolicy: z.enum(CANCELLATION_POLICIES).nullable(),
  paystackReference: z.string().nullable(),
  confirmedAt: z.date().nullable(),
  cancelledAt: z.date().nullable(),
  cancelledBy: z.string().nullable(),
  createdAt: z.date(),
  // The listing, as the trip page shows it.
  listingSlug: z.string(),
  listingTitle: z.string(),
  listingArea: z.string().nullable(),
  listingCity: z.string().nullable(),
  checkInTime: clock,
  checkOutTime: clock,
  coverUrl: z.string().nullable(),
  coverAlt: z.string().nullable(),
  hostFirstName: z.string(),
  guestName: z.string().nullable(),
  guestEmail: z.string().nullable(),
  hasReview: z.boolean(),
  authorizationUrl: z.string().nullable(),
  // PRIVATE, filled ONLY when the booking is confirmed or completed (see
  // the CASE in stayColumns). For any other status the SQL returns NULL,
  // so a held or cancelled stay can't leak the address however the page
  // is written.
  addressLine: z.string().nullable(),
  exactLat: z.string().nullable(),
  exactLng: z.string().nullable(),
  checkinInstructions: z.string().nullable(),
  hostPhone: z.string().nullable(),
})
export type StayDetail = z.infer<typeof StayDetail>

const stayColumns = q`
  s.id, s.kind, s.listing_id AS "listingId", s.host_id AS "hostId", s.guest_id AS "guestId",
  lower(s.nights)::text AS "checkIn", upper(s.nights)::text AS "checkOut", s.nights_count AS "nightsCount",
  s.status, s.hold_expires_at AS "holdExpiresAt", s.guests_count AS "guestsCount", s.price_lines AS "priceLines",
  s.subtotal_kobo AS "subtotalKobo", s.discount_kobo AS "discountKobo", s.cleaning_fee_kobo AS "cleaningFeeKobo",
  s.service_fee_kobo AS "serviceFeeKobo", s.caution_deposit_kobo AS "cautionDepositKobo", s.total_kobo AS "totalKobo",
  s.cancellation_policy AS "cancellationPolicy", s.paystack_reference AS "paystackReference",
  s.confirmed_at AS "confirmedAt", s.cancelled_at AS "cancelledAt", s.cancelled_by AS "cancelledBy", s.created_at AS "createdAt",
  l.slug AS "listingSlug", l.title AS "listingTitle", l.area AS "listingArea", l.city AS "listingCity",
  l.check_in_time::text AS "checkInTime", l.check_out_time::text AS "checkOutTime",
  cover.blob_url AS "coverUrl", cover.alt_text AS "coverAlt",
  split_part(h.name, ' ', 1) AS "hostFirstName", g.name AS "guestName", g.email::text AS "guestEmail",
  EXISTS (SELECT 1 FROM reviews r WHERE r.stay_id = s.id) AS "hasReview",
  (SELECT p.authorization_url FROM payments p WHERE p.stay_id = s.id AND p.status = 'initialized' ORDER BY p.created_at DESC LIMIT 1) AS "authorizationUrl",
  CASE WHEN s.status IN ('confirmed', 'completed') THEN l.address_line END AS "addressLine",
  CASE WHEN s.status IN ('confirmed', 'completed') THEN l.lat::text END AS "exactLat",
  CASE WHEN s.status IN ('confirmed', 'completed') THEN l.lng::text END AS "exactLng",
  CASE WHEN s.status IN ('confirmed', 'completed') THEN l.checkin_instructions END AS "checkinInstructions",
  CASE WHEN s.status IN ('confirmed', 'completed') THEN h.phone END AS "hostPhone"`

const stayFrom = q`
  FROM stays s
  JOIN listings l ON l.id = s.listing_id
  JOIN users h ON h.id = s.host_id
  LEFT JOIN users g ON g.id = s.guest_id
  LEFT JOIN listing_photos cover ON cover.listing_id = l.id AND cover.position = 0`

/** A GUEST's own booking. Someone else's id finds nothing (the service answers 404). */
export async function getGuestStay(db: Db, guestId: string, stayId: string): Promise<StayDetail | null> {
  return one(db, StayDetail, q`SELECT ${stayColumns} ${stayFrom} WHERE s.id = ${stayId} AND s.guest_id = ${guestId} AND s.kind = 'booking'`, 'getGuestStay')
}

/** A booking on one of THIS HOST's listings. Private fields are still only for confirmed stays (the host knows their own address anyway). */
export async function getHostStay(db: Db, hostId: string, stayId: string): Promise<StayDetail | null> {
  return one(db, StayDetail, q`SELECT ${stayColumns} ${stayFrom} WHERE s.id = ${stayId} AND s.host_id = ${hostId} AND s.kind = 'booking'`, 'getHostStay')
}

/** Any stay by id: for the system (payments, emails) and admins. */
export async function getStayById(db: Db, stayId: string): Promise<StayDetail | null> {
  return one(db, StayDetail, q`SELECT ${stayColumns} ${stayFrom} WHERE s.id = ${stayId}`, 'getStayById')
}

export async function listGuestStays(db: Db, guestId: string): Promise<StayDetail[]> {
  return rows(
    db,
    StayDetail,
    q`SELECT ${stayColumns} ${stayFrom}
      WHERE s.guest_id = ${guestId} AND s.kind = 'booking'
      ORDER BY lower(s.nights) DESC, s.created_at DESC
      LIMIT 100`,
    'listGuestStays',
  )
}

/** A host's bookings (not blocks), upcoming first then recent, optionally for one listing. */
export async function listHostStays(db: Db, hostId: string, opts: { listingId?: string; limit?: number } = {}): Promise<StayDetail[]> {
  return rows(
    db,
    StayDetail,
    q`SELECT ${stayColumns} ${stayFrom}
      WHERE s.host_id = ${hostId} AND s.kind = 'booking' AND s.status IN ('held', 'confirmed', 'completed', 'cancelled')
        ${opts.listingId ? q`AND s.listing_id = ${opts.listingId}` : empty}
      ORDER BY (upper(s.nights) < (now() AT TIME ZONE 'Africa/Lagos')::date), lower(s.nights)
      LIMIT ${opts.limit ?? 50}`,
    'listHostStays',
  )
}

/** Every booking, newest first, for /admin. */
export async function listAllStays(db: Db, limit: number): Promise<StayDetail[]> {
  return rows(db, StayDetail, q`SELECT ${stayColumns} ${stayFrom} WHERE s.kind = 'booking' ORDER BY s.created_at DESC LIMIT ${limit}`, 'listAllStays')
}

/** The same guest + key = the same hold (a double-tapped Reserve). */
export async function findByIdempotencyKey(db: Db, guestId: string, key: string): Promise<StayDetail | null> {
  return one(db, StayDetail, q`SELECT ${stayColumns} ${stayFrom} WHERE s.guest_id = ${guestId} AND s.idempotency_key = ${key}`, 'findByIdempotencyKey')
}

export type NewHold = {
  listingId: string
  hostId: string
  guestId: string
  checkIn: string
  checkOut: string
  guestsCount: number
  holdMinutes: number
  priceLines: unknown
  subtotalKobo: number
  discountKobo: number
  cleaningFeeKobo: number
  serviceFeeKobo: number
  cautionDepositKobo: number
  totalKobo: number
  cancellationPolicy: string
  reference: string
  idempotencyKey: string
}

/**
 * THE HOLD. One INSERT; the exclusion constraint stays_no_overlap is what
 * decides whether it's allowed. If another held/confirmed stay of this
 * listing overlaps, PostgreSQL raises 23P01 here (after waiting for that
 * other transaction to commit, if it's still running).
 */
export async function insertHold(db: Db, hold: NewHold): Promise<string> {
  const result = await rows(
    db,
    z.object({ id: z.uuid() }),
    q`INSERT INTO stays (kind, listing_id, host_id, guest_id, nights, status, hold_expires_at, guests_count,
                         price_lines, subtotal_kobo, discount_kobo, cleaning_fee_kobo, service_fee_kobo,
                         caution_deposit_kobo, total_kobo, cancellation_policy, paystack_reference, idempotency_key)
      VALUES ('booking', ${hold.listingId}, ${hold.hostId}, ${hold.guestId}, daterange(${hold.checkIn}::date, ${hold.checkOut}::date, '[)'),
              'held', now() + make_interval(mins => ${hold.holdMinutes}), ${hold.guestsCount},
              ${JSON.stringify(hold.priceLines)}::jsonb, ${hold.subtotalKobo}, ${hold.discountKobo}, ${hold.cleaningFeeKobo},
              ${hold.serviceFeeKobo}, ${hold.cautionDepositKobo}, ${hold.totalKobo}, ${hold.cancellationPolicy},
              ${hold.reference}, ${hold.idempotencyKey})
      RETURNING id`,
    'insertHold',
  )
  return result[0]!.id
}

/** A guarded move: only from one of `from`. Returns whether it happened (false = someone else moved it first). */
export async function moveStay(db: Db, stayId: string, from: readonly string[], to: string, set = empty): Promise<boolean> {
  const result = await db.query(q`
    UPDATE stays SET status = ${to} ${set}
    WHERE id = ${stayId} AND status = ANY(${from as string[]}::text[])
    RETURNING id`)
  return result.length > 0
}

/** Locks a stay row (the cancel and confirm paths), so two of them take turns. */
export async function lockStay(db: Db, stayId: string): Promise<{ id: string; status: string; guestId: string | null; hostId: string } | null> {
  return one(
    db,
    z.object({ id: z.uuid(), status: z.string(), guestId: z.uuid().nullable(), hostId: z.uuid() }),
    q`SELECT id, status, guest_id AS "guestId", host_id AS "hostId" FROM stays WHERE id = ${stayId} FOR UPDATE`,
    'lockStay',
  )
}

// ---------------------------------------------------------------------------
// Host blocks
// ---------------------------------------------------------------------------

/** A host block. host_id comes from the signed-in host: the composite FK refuses someone else's listing (23503). */
export async function insertBlock(db: Db, hostId: string, listingId: string, start: string, end: string, note: string | null): Promise<string> {
  const result = await rows(
    db,
    z.object({ id: z.uuid() }),
    q`INSERT INTO stays (kind, listing_id, host_id, nights, status, block_note)
      VALUES ('host_block', ${listingId}, ${hostId}, daterange(${start}::date, ${end}::date, '[)'), 'confirmed', ${note})
      RETURNING id`,
    'insertBlock',
  )
  return result[0]!.id
}

/**
 * UNBLOCKS [start, end): every active block of this host's listing that
 * touches the range is cancelled, and the parts of it OUTSIDE the range are
 * put back as new blocks. Multirange subtraction does the arithmetic:
 *   datemultirange('[10,20)') - datemultirange('[13,15)') = {[10,13), [15,20)}
 * Two statements, run inside the caller's transaction: the old blocks leave
 * the constraint's held/confirmed set FIRST, so the trimmed pieces never
 * overlap a live block when they're inserted. Returns how many blocks changed.
 */
export async function unblockRange(db: Db, hostId: string, listingId: string, start: string, end: string): Promise<number> {
  const removed = await rows(
    db,
    z.object({ id: z.uuid() }),
    q`UPDATE stays SET status = 'cancelled', cancelled_at = now(), cancelled_by = 'host'
      WHERE kind = 'host_block' AND status = 'confirmed' AND listing_id = ${listingId} AND host_id = ${hostId}
        AND nights && daterange(${start}::date, ${end}::date)
      RETURNING id`,
    'unblockRange',
  )
  if (removed.length === 0) return 0
  await db.query(q`
    INSERT INTO stays (kind, listing_id, host_id, nights, status, block_note)
    SELECT 'host_block', s.listing_id, s.host_id, piece, 'confirmed', s.block_note
    FROM stays s, unnest(datemultirange(s.nights) - datemultirange(daterange(${start}::date, ${end}::date))) AS piece
    WHERE s.id = ANY(${removed.map((r) => r.id)}::uuid[])`)
  return removed.length
}

const CalendarStay = z.object({
  id: z.uuid(),
  kind: z.enum(['booking', 'host_block']),
  start: isoDate,
  end: isoDate,
  status: z.enum(STAY_STATUSES),
  guestFirstName: z.string().nullable(),
  note: z.string().nullable(),
})
export type CalendarStay = z.infer<typeof CalendarStay>

/** The host's month view: occupying stays with the guest's FIRST name only. */
export async function hostCalendar(db: Db, hostId: string, listingId: string, from: string, to: string): Promise<CalendarStay[]> {
  return rows(
    db,
    CalendarStay,
    q`SELECT s.id, s.kind, lower(s.nights)::text AS start, upper(s.nights)::text AS "end", s.status,
             split_part(g.name, ' ', 1) AS "guestFirstName", s.block_note AS note
      FROM stays s LEFT JOIN users g ON g.id = s.guest_id
      WHERE s.listing_id = ${listingId} AND s.host_id = ${hostId}
        AND (${OCCUPYING} OR s.status = 'completed')
        AND s.nights && daterange(${from}::date, ${to}::date)
      ORDER BY lower(s.nights)`,
    'hostCalendar',
  )
}

/** For the iCal feed: every occupying stay from today on. Dates and kind only. */
export async function feedRanges(db: Db, listingId: string): Promise<{ id: string; start: string; end: string; kind: 'booking' | 'host_block' }[]> {
  return rows(
    db,
    z.object({ id: z.uuid(), start: isoDate, end: isoDate, kind: z.enum(['booking', 'host_block']) }),
    q`SELECT s.id, lower(s.nights)::text AS start, upper(s.nights)::text AS "end", s.kind
      FROM stays s
      WHERE s.listing_id = ${listingId} AND ${OCCUPYING}
        AND upper(s.nights) >= (now() AT TIME ZONE 'Africa/Lagos')::date
      ORDER BY lower(s.nights)`,
    'feedRanges',
  )
}
