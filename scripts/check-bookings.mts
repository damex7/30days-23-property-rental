// npm run check:bookings
//
// Runs the REAL service functions against the database in .env.local and
// prints PASS or FAIL for each booking rule. A script, not a test
// framework: it creates two throwaway hosts, three guests and a listing in
// an area nobody else uses ("Checkville"), exercises them, and deletes
// everything it made at the end, whatever happened.
//
// Node runs the app's TypeScript directly: --conditions=react-server makes
// `server-only` a no-op, and scripts/register-paths.mjs resolves "@/..."
// imports (see package.json).

import { randomBytes, randomUUID } from 'node:crypto'
import { hashPassword } from '@/lib/auth/password'
import { http } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { closePool } from '@/lib/db/tx'
import { quoteStay } from '@/lib/pricing'
import { insertBlock } from '@/lib/repos/stays'
import type { User } from '@/lib/rows'
import { searchParamsSchema } from '@/lib/schemas'
import { systemActor } from '@/lib/services/actor'
import { createHold, getMyTrip } from '@/lib/services/bookings'
import { isServiceError } from '@/lib/services/errors'
import { getPublicListing, saveBasics } from '@/lib/services/listings'
import { confirmStay } from '@/lib/services/payments'
import { searchStays } from '@/lib/services/search'
import { addDays, todayInLagos } from '@/lib/time'
import { findUserByEmail } from '@/lib/users'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
async function errorKind(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
    return 'ok'
  } catch (error) {
    if (isServiceError(error)) return `${error.kind}:${error.code}`
    throw error
  }
}

const run = randomBytes(4).toString('hex')
const emails = { hostA: `check+host-a-${run}@example.com`, hostB: `check+host-b-${run}@example.com`, g1: `check+g1-${run}@example.com`, g2: `check+g2-${run}@example.com`, g3: `check+g3-${run}@example.com` }
const ADDRESS = `${run} Secret Close, Checkville`
const today = todayInLagos()
const D = (n: number) => addDays(today, n)

async function makeUser(email: string, role: 'guest' | 'host'): Promise<User> {
  await http.query(q`INSERT INTO users (email, name, role, password_hash, email_verified_at, phone)
                     VALUES (${email}, ${`Check ${role}`}, ${role}, ${await hashPassword(randomUUID())}, now(), ${role === 'host' ? '+2348000000001' : null})`)
  const user = await findUserByEmail(email)
  if (!user) throw new Error(`could not create ${email}`)
  return user
}

const hold = (guest: User, listingId: string, checkIn: string, checkOut: string, guests = 2) =>
  createHold(guest, { listingId, checkIn, checkOut, guests, idempotencyKey: `chk-${randomUUID()}` })

let listingId = ''
let slug = ''
try {
  const hostA = await makeUser(emails.hostA, 'host')
  const hostB = await makeUser(emails.hostB, 'host')
  const g1 = await makeUser(emails.g1, 'guest')
  const g2 = await makeUser(emails.g2, 'guest')
  const g3 = await makeUser(emails.g3, 'guest')

  // A published listing in its own area, so searches see only it.
  slug = `checkville-flat-${run}`
  const rows = await http.query(q`
    INSERT INTO listings (host_id, slug, title, description, property_type, bedrooms, bathrooms, max_guests, state, city, area, address_line,
                          lat, lng, nightly_kobo, weekend_kobo, cleaning_fee_kobo, caution_deposit_kobo, weekly_discount_percent,
                          min_nights, max_nights, status, published_at)
    VALUES (${hostA.id}, ${slug}, 'Check script flat', 'A flat that only exists while the check script runs, in a town that does not exist.',
            'apartment', 2, 1, 4, 'Lagos', 'Checkville', 'Checkville', ${ADDRESS}, 6.512345, 3.398765,
            5000000, 6500000, 1500000, 5000000, 10, 1, 30, 'published', now())
    RETURNING id`)
  listingId = String(rows[0]!.id)

  // 1. Overlap refused.
  const a = await hold(g1, listingId, D(10), D(13))
  const overlap = await errorKind(hold(g2, listingId, D(11), D(14)))
  check('An overlapping booking is rejected (23P01 → "nights_taken")', a.kind === 'new' && overlap === 'conflict:nights_taken', overlap)

  // 2. Back to back allowed: [10,13) and [13,15) share no night.
  const backToBack = await errorKind(hold(g2, listingId, D(13), D(15)))
  check('Back-to-back stays are allowed (check-out day = next check-in day)', backToBack === 'ok', backToBack)

  // 3. A host block stops a booking (same table, same constraint).
  await insertBlock(http, hostA.id, listingId, D(20), D(23), 'check')
  const onBlock = await errorKind(hold(g1, listingId, D(21), D(22)))
  check('A host block stops a booking', onBlock === 'conflict:nights_taken', onBlock)

  // 4. An expired hold no longer blocks.
  const stale = await hold(g1, listingId, D(30), D(32))
  if (stale.kind === 'new') await http.query(q`UPDATE stays SET hold_expires_at = now() - interval '1 minute' WHERE id = ${stale.stayId}`)
  const afterExpiry = await errorKind(hold(g2, listingId, D(30), D(32)))
  const staleNow = stale.kind === 'new' ? await http.query(q`SELECT status FROM stays WHERE id = ${stale.stayId}`) : []
  check('An expired hold no longer blocks (swept in the same transaction)', afterExpiry === 'ok' && staleNow[0]?.status === 'expired', `${afterExpiry}, old hold ${String(staleNow[0]?.status)}`)

  // 5. Ten simultaneous reserves for the same nights: exactly one hold.
  const racers = [g1, g2, g3, g1, g2, g3, g1, g2, g3, g1]
  const results = await Promise.allSettled(racers.map((g) => hold(g, listingId, D(40), D(43))))
  const won = results.filter((r) => r.status === 'fulfilled').length
  const taken = results.filter((r) => r.status === 'rejected' && isServiceError(r.reason) && r.reason.code === 'nights_taken').length
  check('10 simultaneous reserves for the same nights give exactly 1 hold', won === 1 && taken === 9, `${won} held, ${taken} refused`)

  // 6. Pricing, worked out by hand. ₦50,000 weekday, ₦65,000 Fri/Sat, ₦15,000
  //    cleaning, ₦50,000 deposit, 10% off 7+ nights. Mon 1 Mar 2027 to Tue 9 Mar
  //    2027 = 8 nights: Mon Tue Wed Thu FRI SAT Sun Mon.
  //    nights   6 × 50,000 + 2 × 65,000            = 430,000.00
  //    discount 10% of 430,000                      = −43,000.00
  //    cleaning                                     =  15,000.00
  //    service  5% of (430,000 − 43,000 + 15,000)   =  20,100.00
  //    deposit                                      =  50,000.00
  //    total                                        = 472,100.00 → 47,210,000 kobo
  const quote = quoteStay({ nightlyKobo: 5_000_000, weekendKobo: 6_500_000, cleaningFeeKobo: 1_500_000, cautionDepositKobo: 5_000_000, weeklyDiscountPercent: 10 }, '2027-03-01', '2027-03-09')
  check(
    'Pricing with weekend nights and a 7+ night discount matches the hand-worked total',
    quote.totalKobo === 47_210_000 && quote.subtotalKobo === 43_000_000 && quote.discountKobo === 4_300_000 && quote.serviceFeeKobo === 2_010_000 && quote.nights.filter((n) => n.kind === 'weekend').length === 2,
    `total ${quote.totalKobo} kobo`,
  )

  // 7. Search with dates excludes a booked listing, and includes it on free dates.
  const busySearch = await searchStays(null, searchParamsSchema.parse({ where: 'Checkville', checkin: D(11), checkout: D(12) }))
  const freeSearch = await searchStays(null, searchParamsSchema.parse({ where: 'Checkville', checkin: D(50), checkout: D(52) }))
  check(
    'Search with dates excludes a booked listing (and shows it when free)',
    !busySearch.items.some((i) => i.id === listingId) && freeSearch.items.some((i) => i.id === listingId),
    `busy dates: ${busySearch.items.length} result(s), free dates: ${freeSearch.items.length}`,
  )

  // 8. A guest opening another guest's booking gets "not found".
  const g1Stay = a.kind === 'new' ? a.stayId : ''
  const peek = await errorKind(getMyTrip(g2, g1Stay))
  const own = await errorKind(getMyTrip(g1, g1Stay))
  check('A guest opening another guest’s booking gets not found', peek === 'not_found:not_found' && own === 'ok', `other: ${peek}, own: ${own}`)

  // 9. A host editing another host's listing gets "not found".
  const edit = await errorKind(saveBasics(hostB, listingId, 1, { title: 'Taken over', description: 'x'.repeat(50), propertyType: 'studio', bedrooms: 0, bathrooms: 1, maxGuests: 2 }))
  check('A host editing another host’s listing gets not found', edit === 'not_found:not_found', edit)

  // 10. The exact address (and exact pin) is absent from the public listing.
  const publicJson = JSON.stringify(await getPublicListing(null, slug))
  check(
    'The exact address is absent from a public listing response',
    !publicJson.includes(ADDRESS) && !publicJson.includes('Secret Close') && !publicJson.includes('6.512345') && !publicJson.includes('3.398765'),
    'checked the address, and the exact lat/lng',
  )

  // EXTRA 11. Exactly-once confirmation: the callback and the webhook at the same instant.
  if (a.kind === 'new') {
    const paid = { id: 1, status: 'success', reference: a.reference, amount: a.totalKobo, currency: 'NGN', channel: 'card', gateway_response: 'Approved', paid_at: new Date().toISOString() }
    const both = await Promise.all([confirmStay(systemActor('Check script'), a.reference, paid), confirmStay(systemActor('Check script'), a.reference, paid)])
    const confirmed = both.filter((r) => r.result === 'confirmed').length
    const successes = await http.query(q`SELECT count(*)::int AS n FROM payments WHERE stay_id = ${a.stayId} AND status = 'success'`)
    check('Callback + webhook together confirm exactly once', confirmed === 1 && Number(successes[0]?.n) === 1, both.map((r) => r.result).join(' + '))
  }

  // EXTRA 12. Paid after the hold expired AND the nights were taken: refused, refund flagged.
  const late = await hold(g3, listingId, D(60), D(62))
  if (late.kind === 'new') {
    await http.query(q`UPDATE stays SET hold_expires_at = now() - interval '1 minute' WHERE id = ${late.stayId}`)
    const thief = await hold(g1, listingId, D(60), D(62))
    const paid = { id: 2, status: 'success', reference: late.reference, amount: late.totalKobo, currency: 'NGN', channel: 'card', gateway_response: 'Approved', paid_at: null }
    const result = await confirmStay(systemActor('Check script'), late.reference, paid)
    const refunds = await http.query(q`SELECT count(*)::int AS n FROM refunds WHERE stay_id = ${late.stayId} AND status = 'pending'`)
    check('A payment after the hold expired and the nights were taken is refused and flagged for a refund', thief.kind === 'new' && result.result === 'refund_pending' && Number(refunds[0]?.n) === 1, result.result)
  }

  // EXTRA 13. A payment with the wrong amount is refused.
  const cheap = await hold(g2, listingId, D(70), D(72))
  if (cheap.kind === 'new') {
    const result = await confirmStay(systemActor('Check script'), cheap.reference, { id: 3, status: 'success', reference: cheap.reference, amount: 100, currency: 'NGN', channel: 'card', gateway_response: 'Approved', paid_at: null })
    const status = await http.query(q`SELECT status FROM stays WHERE id = ${cheap.stayId}`)
    check('A payment with the wrong amount is refused (and the hold released)', result.result === 'refund_pending' && status[0]?.status === 'cancelled', `${result.result}, stay ${String(status[0]?.status)}`)
  }
} catch (error) {
  failed++
  console.error('FAIL  the check script itself crashed:', error)
} finally {
  // Clean up everything this run made, children first.
  const ids = await http.query(q`SELECT id FROM users WHERE email = ANY(${Object.values(emails)}::citext[])`)
  const userIds = ids.map((r) => String(r.id))
  if (listingId) {
    await http.query(q`DELETE FROM refunds WHERE stay_id IN (SELECT id FROM stays WHERE listing_id = ${listingId})`)
    await http.query(q`DELETE FROM payments WHERE stay_id IN (SELECT id FROM stays WHERE listing_id = ${listingId})`)
    await http.query(q`DELETE FROM email_log WHERE subject_id IN (SELECT id::text FROM stays WHERE listing_id = ${listingId})`)
    await http.query(q`DELETE FROM stays WHERE listing_id = ${listingId}`)
    await http.query(q`DELETE FROM listings WHERE id = ${listingId}`)
  }
  if (userIds.length) {
    await http.query(q`DELETE FROM users WHERE id = ANY(${userIds}::uuid[])`)
  }
  await closePool()
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exitCode = failed > 0 ? 1 : 0
}
