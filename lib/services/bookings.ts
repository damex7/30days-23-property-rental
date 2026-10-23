// BOOKINGS: quotes, Reserve, trips and cancellations.
//
// RESERVE, step by step (README, diagram 2):
//   1. The same guest + Idempotency-Key already made a hold?  Return it.
//      (A double tap sends the key twice; the second gets the first hold.)
//   2. BEGIN
//   3.   Read the listing FOR SHARE (published, its prices, its rules).
//   4.   Check the rules: not your own place, check-in not in the past (Lagos
//        today), at most 12 months ahead, nights within min/max, guests.
//   5.   EXPIRE this listing's holds that are past hold_expires_at. The
//        exclusion constraint can't say "held and not expired" (now() isn't
//        allowed in it), so a hold 30 seconds past its time would still
//        block the nights. Sweeping HERE, in the same transaction as the
//        insert, closes the gap a separate sweep would leave: between "sweep"
//        and "insert" no stale hold can be standing in the way, and the row
//        locks taken by the UPDATE make a racing Reserve wait its turn.
//   6.   Price it ON THE SERVER (lib/pricing.ts) and INSERT the 15-minute
//        hold with the price snapshot, and its payment row.
//        → The EXCLUSION CONSTRAINT is the real guard: if any held or
//          confirmed stay overlaps, PostgreSQL refuses with 23P01, which is
//          answered "Those nights were just taken. Pick other dates."
//   7. COMMIT, then start the Paystack transaction (outside the
//      transaction: never hold database locks while waiting on the internet).
import 'server-only'

import { randomBytes } from 'node:crypto'
import { appUrl } from '@/lib/auth/email'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { dateProblem, lastCheckInDate } from '@/lib/booking-rules'
import { http } from '@/lib/db/executor'
import { isExclusionError, isUniqueError } from '@/lib/db/errors'
import { q } from '@/lib/db/sql'
import { withTransaction } from '@/lib/db/tx'
import { HOLD_MINUTES } from '@/lib/options'
import { initializeTransaction } from '@/lib/payments/paystack'
import { quoteStay, type Quote } from '@/lib/pricing'
import { refundPreview, type RefundPreview } from '@/lib/refunds'
import * as listingsRepo from '@/lib/repos/listings'
import * as paymentsRepo from '@/lib/repos/payments'
import * as staysRepo from '@/lib/repos/stays'
import type { ReserveInput } from '@/lib/schemas'
import { addDays, daysBetween, todayInLagos } from '@/lib/time'
import { assertCanWrite, requireHost, requireUser, type Actor } from './actor'
import { conflict, invalid, notFound, ServiceError } from './errors'
import { sendCancellationEmails } from './notifications'

const NIGHTS_TAKEN = 'Those nights were just taken. Pick other dates.'

function pricesOf(listing: listingsRepo.BookableListing) {
  return {
    nightlyKobo: listing.nightlyKobo,
    weekendKobo: listing.weekendKobo,
    cleaningFeeKobo: listing.cleaningFeeKobo,
    cautionDepositKobo: listing.cautionDepositKobo,
    weeklyDiscountPercent: listing.weeklyDiscountPercent,
  }
}

/** The rules every booking must pass, as a field-level ServiceError. */
function checkRules(listing: listingsRepo.BookableListing, guestId: string | null, input: { checkIn: string; checkOut: string; guests: number }, today: string): void {
  if (guestId && guestId === listing.hostId) throw invalid('own_listing', 'This is your own listing, so you can’t book it. Use the calendar to block nights instead.')
  const problem = dateProblem({ checkIn: input.checkIn, checkOut: input.checkOut, today, minNights: listing.minNights, maxNights: listing.maxNights })
  if (problem) throw invalid('bad_dates', problem, [{ field: 'checkIn', message: problem }])
  if (input.guests > listing.maxGuests) {
    throw invalid('too_many_guests', `This place sleeps up to ${listing.maxGuests}.`, [{ field: 'guests', message: `Up to ${listing.maxGuests} guests.` }])
  }
}

// ---------------------------------------------------------------------------
// Availability and quotes (visitors welcome)
// ---------------------------------------------------------------------------

export type Availability = {
  today: string
  lastCheckIn: string
  minNights: number
  maxNights: number
  maxGuests: number
  busy: staysRepo.BusyRange[]
}

/** The busy ranges for the next 12 months, for the date picker. Lazily sweeps expired holds first (Day 20). */
export async function getAvailability(_actor: Actor, listingId: string): Promise<Availability> {
  const listing = await listingsRepo.getBookable(http, listingId)
  if (!listing) throw notFound('Listing')
  await staysRepo.expireStaleHolds(http, { listingId })
  const today = todayInLagos()
  const lastCheckIn = lastCheckInDate(today)
  const busy = await staysRepo.busyRanges(http, listingId, today, addDays(lastCheckIn, 91))
  return { today, lastCheckIn, minNights: listing.minNights, maxNights: listing.maxNights, maxGuests: listing.maxGuests, busy }
}

export type QuoteAnswer = { ok: true; quote: Quote } | { ok: false; problem: string }

/** The live quote in the booking panel: the same rules and the same pricing as Reserve, but nothing is held. */
export async function quoteForListing(actor: Actor, listingId: string, input: { checkIn: string; checkOut: string; guests: number }): Promise<QuoteAnswer> {
  const listing = await listingsRepo.getBookable(http, listingId)
  if (!listing) throw notFound('Listing')
  try {
    checkRules(listing, actor?.id ?? null, input, todayInLagos())
  } catch (error) {
    if (error instanceof ServiceError) return { ok: false, problem: error.message }
    throw error
  }
  if (await staysRepo.isRangeBusy(http, listingId, input.checkIn, input.checkOut)) {
    return { ok: false, problem: 'Some of those nights are already booked. Pick other dates.' }
  }
  const rules = await listingsRepo.listPriceRules(http, listingId, input.checkIn, input.checkOut)
  return { ok: true, quote: quoteStay(pricesOf(listing), input.checkIn, input.checkOut, rules) }
}

// ---------------------------------------------------------------------------
// Reserve
// ---------------------------------------------------------------------------

export type ReserveResult = { stayId: string; authorizationUrl: string | null; replay: boolean }

/** A reference Paystack shows on its receipt: SB-<12 random chars>. Ours, so it can't collide with anyone else's. */
function newReference(): string {
  return `SB-${randomBytes(9).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`
}

function replayOf(stay: staysRepo.StayDetail): ReserveResult {
  if (stay.status === 'held' && stay.holdExpiresAt && stay.holdExpiresAt > new Date()) return { stayId: stay.id, authorizationUrl: stay.authorizationUrl, replay: true }
  if (stay.status === 'confirmed' || stay.status === 'completed') return { stayId: stay.id, authorizationUrl: null, replay: true }
  throw conflict('hold_ended', 'That reservation is no longer held. Choose your dates again to start a new one.')
}

/** Reserve = createHold (the database part) + the Paystack step. */
export async function reserve(actor: Actor, input: ReserveInput, context: { ip: string }): Promise<ReserveResult> {
  const guest = requireUser(actor)
  const limit = await checkRateLimit('reserve', context.ip, guest.id)
  if (!limit.ok) throw new ServiceError('rate_limited', 'rate_limited', limit.message, { retryAfterSeconds: limit.retryAfterSeconds })
  const hold = await createHold(guest, input)
  if (hold.kind === 'replay') return hold.result
  return startPayment(guest, hold)
}

export type Hold = { kind: 'new'; stayId: string; reference: string; totalKobo: number; title: string } | { kind: 'replay'; result: ReserveResult }

/**
 * Steps 1-6: the HOLD, all in the database. Separate from the Paystack step
 * so the check script can race ten of them without touching the network.
 */
export async function createHold(actor: Actor, input: ReserveInput): Promise<Hold> {
  const guest = requireUser(actor)
  assertCanWrite(guest)

  // 1. A replay of the same tap.
  const existing = await staysRepo.findByIdempotencyKey(http, guest.id, input.idempotencyKey)
  if (existing) return { kind: 'replay', result: replayOf(existing) }

  const today = todayInLagos()
  try {
    const held = await withTransaction(async (tx) => {
      const listing = await listingsRepo.getBookable(tx, input.listingId, { lock: true })
      if (!listing) throw notFound('Listing')
      checkRules(listing, guest.id, input, today)
      // 5. Free this listing's stale holds before the constraint judges our insert.
      await staysRepo.expireStaleHolds(tx, { listingId: listing.id })
      // 6. The server's own price: the browser sent none.
      const rules = await listingsRepo.listPriceRules(tx, listing.id, input.checkIn, input.checkOut)
      const quote = quoteStay(pricesOf(listing), input.checkIn, input.checkOut, rules)
      const reference = newReference()
      const stayId = await staysRepo.insertHold(tx, {
        listingId: listing.id,
        hostId: listing.hostId,
        guestId: guest.id,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guestsCount: input.guests,
        holdMinutes: HOLD_MINUTES,
        priceLines: quote.nights,
        subtotalKobo: quote.subtotalKobo,
        discountKobo: quote.discountKobo,
        cleaningFeeKobo: quote.cleaningFeeKobo,
        serviceFeeKobo: quote.serviceFeeKobo,
        cautionDepositKobo: quote.cautionDepositKobo,
        totalKobo: quote.totalKobo,
        cancellationPolicy: listing.cancellationPolicy,
        reference,
        idempotencyKey: input.idempotencyKey,
      })
      await paymentsRepo.insertPayment(tx, { stayId, reference, amountKobo: quote.totalKobo })
      return { stayId, reference, totalKobo: quote.totalKobo, title: listing.title }
    })
    return { kind: 'new', ...held }
  } catch (error) {
    // THE GUARD: another held or confirmed stay overlaps these nights.
    if (isExclusionError(error, 'stays_no_overlap')) throw conflict('nights_taken', NIGHTS_TAKEN)
    // Two taps raced past step 1 at the same instant: the unique index let one win.
    if (isUniqueError(error, 'stays_idempotency_idx')) {
      const winner = await staysRepo.findByIdempotencyKey(http, guest.id, input.idempotencyKey)
      if (winner) return { kind: 'replay', result: replayOf(winner) }
    }
    throw error
  }
}

/** Step 7: Paystack, after COMMIT. */
async function startPayment(guest: { email: string }, held: Extract<Hold, { kind: 'new' }>): Promise<ReserveResult> {
  try {
    const { authorizationUrl } = await initializeTransaction({
      email: guest.email,
      amountKobo: held.totalKobo,
      reference: held.reference,
      callbackUrl: appUrl('/api/payments/callback'),
      metadata: { stay_id: held.stayId, listing: held.title.slice(0, 80) },
    })
    await paymentsRepo.saveAuthorizationUrl(http, held.reference, authorizationUrl)
    return { stayId: held.stayId, authorizationUrl, replay: false }
  } catch (error) {
    // Payment couldn't start: release the nights NOW rather than in 15 minutes.
    console.error('[reserve] Paystack initialise failed:', error instanceof Error ? error.message : error)
    await staysRepo.moveStay(http, held.stayId, ['held'], 'cancelled', q`, cancelled_at = now(), cancelled_by = 'system'`)
    await http.query(q`UPDATE payments SET status = 'failed', gateway_response = 'initialize failed' WHERE reference = ${held.reference} AND status = 'initialized'`)
    throw new ServiceError('unavailable', 'paystack_unavailable', 'We couldn’t reach Paystack just now, so nothing was held or charged. Please try again in a minute.')
  }
}

// ---------------------------------------------------------------------------
// Trips (the guest's own bookings)
// ---------------------------------------------------------------------------

/** Lazily tidies this guest's stays (expired holds, finished stays) before showing them. */
export async function listMyTrips(actor: Actor): Promise<staysRepo.StayDetail[]> {
  const guest = requireUser(actor)
  await staysRepo.expireStaleHolds(http, { guestId: guest.id })
  await staysRepo.completeFinishedStays(http, { guestId: guest.id })
  return staysRepo.listGuestStays(http, guest.id)
}

/** One of MY trips, or 404. Someone else's booking id is "not found", exactly like a made-up one. */
export async function getMyTrip(actor: Actor, stayId: string): Promise<staysRepo.StayDetail & { refunds: Awaited<ReturnType<typeof paymentsRepo.refundsFor>> }> {
  const guest = requireUser(actor)
  if (!/^[0-9a-f-]{36}$/i.test(stayId)) throw notFound('Trip')
  await staysRepo.expireStaleHolds(http, { guestId: guest.id })
  const stay = await staysRepo.getGuestStay(http, guest.id, stayId)
  if (!stay) throw notFound('Trip')
  return { ...stay, refunds: await paymentsRepo.refundsFor(http, stay.id) }
}

export function previewCancellation(stay: staysRepo.StayDetail, now = new Date()): RefundPreview {
  if (stay.status !== 'held' && stay.status !== 'confirmed') {
    return { allowed: false, percent: 0, stayRefundKobo: 0, depositRefundKobo: 0, refundKobo: 0, deadline: null, explanation: 'This booking can’t be cancelled.' }
  }
  return refundPreview({
    policy: stay.cancellationPolicy ?? 'strict',
    checkIn: stay.checkIn,
    checkInTime: stay.checkInTime,
    paid: stay.status === 'confirmed',
    totalKobo: stay.totalKobo ?? 0,
    depositKobo: stay.cautionDepositKobo ?? 0,
    now,
  })
}

/**
 * CANCEL: frees the nights at once (status leaves the constraint's
 * held/confirmed set in the same UPDATE) and records the refund as PENDING
 * (refunds are recorded, not sent). The row is locked first, so a payment
 * confirmation racing the cancel takes its turn.
 */
export async function cancelMyTrip(actor: Actor, stayId: string): Promise<RefundPreview> {
  const guest = requireUser(actor)
  const stay = await staysRepo.getGuestStay(http, guest.id, stayId)
  if (!stay) throw notFound('Trip')
  const preview = await withTransaction(async (tx) => {
    const locked = await staysRepo.lockStay(tx, stayId)
    if (!locked || locked.guestId !== guest.id) throw notFound('Trip')
    const fresh = { ...stay, status: locked.status as typeof stay.status }
    const result = previewCancellation(fresh)
    if (!result.allowed) throw conflict('not_cancellable', result.explanation)
    const moved = await staysRepo.moveStay(tx, stayId, ['held', 'confirmed'], 'cancelled', q`, cancelled_at = now(), cancelled_by = 'guest'`)
    if (!moved) throw conflict('not_cancellable', 'This booking changed a moment ago. Reload the page.')
    if (fresh.status === 'confirmed' && result.refundKobo > 0) {
      const payment = await paymentsRepo.successfulPayment(tx, stayId)
      if (payment) {
        await paymentsRepo.insertRefund(tx, {
          stayId,
          paymentId: payment.id,
          amountKobo: Math.min(result.refundKobo, payment.amountKobo),
          kind: 'cancellation',
          reason: `Cancelled by the guest (${fresh.cancellationPolicy} policy, ${result.percent}% of the stay)`,
          breakdown: { percent: result.percent, stayRefundKobo: result.stayRefundKobo, depositRefundKobo: result.depositRefundKobo },
        })
      }
    }
    return result
  })
  if (stay.status === 'confirmed') await sendCancellationEmails(stayId)
  return preview
}

// ---------------------------------------------------------------------------
// The host's side
// ---------------------------------------------------------------------------

export async function listBookingsForMyListings(actor: Actor, opts: { listingId?: string } = {}) {
  const host = requireHost(actor, { write: false })
  await staysRepo.completeFinishedStays(http, { hostId: host.id })
  const stays = await staysRepo.listHostStays(http, host.id, { ...opts, limit: 100 })
  // The shared demo host sees bookings made by many visitors: mask them.
  return host.isDemo ? stays.map(maskGuest) : stays
}

/** "Demo Guest" → "D. G.", and no email: other visitors' details stay private on the shared demo host. */
export function maskGuest<T extends { guestName: string | null; guestEmail: string | null }>(stay: T): T {
  const initials = (stay.guestName ?? 'Guest')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase()}.`)
    .join(' ')
  return { ...stay, guestName: initials || 'Guest', guestEmail: null }
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return daysBetween(checkIn, checkOut)
}
