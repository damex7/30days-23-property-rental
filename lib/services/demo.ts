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
import { demoAddress } from '@/lib/auth/email'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import type { RequestInfo } from '@/lib/auth/request'
import { startSession } from '@/lib/auth/session'
import { http } from '@/lib/db/executor'
import { withTransaction } from '@/lib/db/tx'
import * as repo from '@/lib/repos/demo'
import type { SystemActor } from './actor'
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
}

/**
 * The demo guest's sample trips. Stage 5 fills this in (an upcoming
 * confirmed stay and a completed one waiting for a review).
 */
async function giveDemoGuestTrips(_tx: Parameters<Parameters<typeof withTransaction>[0]>[0], _guestId: string): Promise<void> {}

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
