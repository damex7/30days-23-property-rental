// DEMO MODE (the Day 20 pattern), switched on with DEMO_MODE=true.
//
//   "Try as a guest"        → a FRESH demo guest per click, isolated from
//                             every other visitor, deleted after 24 hours.
//   "Look around as a host" → ONE shared demo host made by the seed. It is
//                             READ-ONLY: every host write calls
//                             assertCanWrite() (lib/services/actor.ts), so
//                             a visitor can't change what the next one sees.
//
// No passwords (demo accounts have none, migration 006), POST-only buttons
// (Server Actions, never links), and a per-IP rate limit. Demo emails are
// demo+<id>@example.com: Paystack refused Day 20's ".invalid" addresses,
// and example.com is reserved, so nothing is ever really sent there.
import 'server-only'

import { randomBytes } from 'node:crypto'
import { after } from 'next/server'
import { demoAddress } from '@/lib/auth/email'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import type { RequestInfo } from '@/lib/auth/request'
import { startSession } from '@/lib/auth/session'
import { isExclusionError } from '@/lib/db/errors'
import { http, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { withTransaction } from '@/lib/db/tx'
import { quoteStay } from '@/lib/pricing'
import * as repo from '@/lib/repos/demo'
import * as listingsRepo from '@/lib/repos/listings'
import * as staysRepo from '@/lib/repos/stays'
import { addDays, todayInLagos } from '@/lib/time'
import { systemActor, type SystemActor } from './actor'
import { notFound, ServiceError } from './errors'

export const DEMO_HOST_EMAIL = demoAddress('host')
export const DEMO_GUEST_LIFETIME_HOURS = 24

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE !== 'false'
}

async function guard(request: RequestInfo): Promise<void> {
  if (!isDemoMode()) throw notFound('Page')
  const limit = await checkRateLimit('demo', request.ip, null)
  if (!limit.ok) throw new ServiceError('rate_limited', 'rate_limited', limit.message, { retryAfterSeconds: limit.retryAfterSeconds })
}

/** A brand-new demo guest, signed in. Must run in a Server Action (it sets the session cookie). */
export async function startDemoGuest(request: RequestInfo): Promise<void> {
  await guard(request)
  const userId = await withTransaction(async (tx) => {
    const id = await repo.insertDemoGuest(tx, { email: demoAddress(randomBytes(6).toString('hex')), name: 'Demo Guest' })
    await giveDemoGuestTrips(tx, id)
    return id
  })
  await startSession(userId, request, { type: 'demo_started', userId, request, metadata: { as: 'guest' } })
  // LAZY CLEANUP (Day 20): starting a demo tidies away guests past their 24
  // hours, after the response, so the visitor doesn't wait for it.
  after(() => cleanupDemoGuests(systemActor('Demo')).then(() => undefined))
}

/**
 * THE DEMO GUEST'S TRIPS, on the shared demo host's listings (so no real
 * host's calendar fills up with demo bookings):
 *   - an UPCOMING confirmed, "paid" stay in the first free 3-night window
 *     from two weeks ahead (paid with a demo payment row, not Paystack);
 *   - a COMPLETED stay from last week, waiting for their review.
 * Both priced by lib/pricing.ts, like any booking. The upcoming one goes
 * through the exclusion constraint like everything else: if another demo
 * guest took that window a moment ago, the next window is tried.
 */
async function giveDemoGuestTrips(tx: Db, guestId: string): Promise<void> {
  const listingIds = await repo.demoHostListings(tx, DEMO_HOST_EMAIL)
  const listing = listingIds[0] ? await listingsRepo.getBookable(tx, listingIds[0]) : null
  if (!listing) return // the seed hasn't made the demo host's listings: the demo still works, with no trips
  const today = todayInLagos()
  const prices = { nightlyKobo: listing.nightlyKobo, weekendKobo: listing.weekendKobo, cleaningFeeKobo: listing.cleaningFeeKobo, cautionDepositKobo: listing.cautionDepositKobo, weeklyDiscountPercent: listing.weeklyDiscountPercent }

  async function insertStay(checkIn: string, checkOut: string, status: 'confirmed' | 'completed') {
    const quote = quoteStay(prices, checkIn, checkOut)
    const reference = `SB-DEMO-${randomBytes(6).toString('hex').toUpperCase()}`
    const inserted = await tx.query(q`
      INSERT INTO stays (kind, listing_id, host_id, guest_id, nights, status, guests_count, price_lines, subtotal_kobo, discount_kobo,
                         cleaning_fee_kobo, service_fee_kobo, caution_deposit_kobo, total_kobo, cancellation_policy, paystack_reference,
                         confirmed_at, completed_at)
      VALUES ('booking', ${listing!.id}, ${listing!.hostId}, ${guestId}, daterange(${checkIn}::date, ${checkOut}::date, '[)'), ${status}, 2,
              ${JSON.stringify(quote.nights)}::jsonb, ${quote.subtotalKobo}, ${quote.discountKobo}, ${quote.cleaningFeeKobo}, ${quote.serviceFeeKobo},
              ${quote.cautionDepositKobo}, ${quote.totalKobo}, ${listing!.cancellationPolicy}, ${reference}, now(), ${status === 'completed' ? q`now()` : q`NULL`})
      RETURNING id`)
    await tx.query(q`INSERT INTO payments (stay_id, provider, reference, amount_kobo, status, paid_at)
                     VALUES (${String(inserted[0]!.id)}, 'demo', ${reference.replace('SB-', 'DEMO-')}, ${quote.totalKobo}, 'success', now())`)
  }

  await insertStay(addDays(today, -10), addDays(today, -7), 'completed')
  // Look for a free window; a SAVEPOINT lets a clash (23P01) be undone without losing the rest.
  for (let start = 14; start < 120; start += 4) {
    const checkIn = addDays(today, start)
    if (await staysRepo.isRangeBusy(tx, listing.id, checkIn, addDays(checkIn, 3))) continue
    await tx.query(q`SAVEPOINT demo_trip`)
    try {
      await insertStay(checkIn, addDays(checkIn, 3), 'confirmed')
      await tx.query(q`RELEASE SAVEPOINT demo_trip`)
      return
    } catch (error) {
      await tx.query(q`ROLLBACK TO SAVEPOINT demo_trip`)
      if (!isExclusionError(error, 'stays_no_overlap')) throw error
    }
  }
}

/** Signs in as the shared, read-only demo host. */
export async function startDemoHost(request: RequestInfo): Promise<void> {
  await guard(request)
  const userId = await repo.findDemoHost(http, DEMO_HOST_EMAIL)
  if (!userId) throw new ServiceError('unavailable', 'demo_not_seeded', 'The demo host hasn’t been set up yet. Run npm run db:seed.')
  await startSession(userId, request, { type: 'demo_started', userId, request, metadata: { as: 'host' } })
}

/** The 24-hour cleanup, from the daily cron. One transaction per guest, so one problem can't hold up the rest. */
export async function cleanupDemoGuests(_system: SystemActor): Promise<number> {
  const ids = await repo.listExpiredDemoGuests(http, DEMO_GUEST_LIFETIME_HOURS, 200)
  let removed = 0
  for (const id of ids) if (await withTransaction((tx) => repo.deleteDemoGuest(tx, id))) removed++
  return removed
}
