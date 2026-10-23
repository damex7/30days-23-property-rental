// REVIEWS: one per completed booking, from that booking's guest only.
//
// The rules, and where each is enforced:
//   - only the stay's guest:   the stay is read with getGuestStay (WHERE
//                              guest_id = actor), and the composite FK
//                              (stay_id, listing_id, guest_id) in 010
//   - only once:               UNIQUE (stay_id) → 23505 → a clear message
//   - only after completion:   checked here, and by the trigger in 010
// The listing's cached rating is refreshed IN THE SAME TRANSACTION as the
// insert, so it can't drift from the reviews it summarises.
import 'server-only'

import { http } from '@/lib/db/executor'
import { isUniqueError } from '@/lib/db/errors'
import { withTransaction } from '@/lib/db/tx'
import { refreshRating } from '@/lib/repos/listings'
import * as repo from '@/lib/repos/reviews'
import { getGuestStay } from '@/lib/repos/stays'
import type { ReviewInput } from '@/lib/schemas'
import { requireHost, requireUser, type Actor } from './actor'
import { conflict, notFound } from './errors'

export async function listingReviews(_actor: Actor, listingId: string) {
  const [averages, reviews] = await Promise.all([repo.averagesFor(http, listingId), repo.listForListing(http, listingId, 20)])
  return { averages, reviews }
}

export async function leaveReview(actor: Actor, stayId: string, input: ReviewInput): Promise<void> {
  const guest = requireUser(actor)
  const stay = await getGuestStay(http, guest.id, stayId)
  if (!stay) throw notFound('Trip')
  if (stay.status !== 'completed') throw conflict('not_completed', 'You can review a stay once it’s over: the day after check-out.')
  if (stay.hasReview) throw conflict('already_reviewed', 'You’ve already reviewed this stay. Thank you!')
  try {
    await withTransaction(async (tx) => {
      await repo.insertReview(tx, { stayId, listingId: stay.listingId, guestId: guest.id, ...input })
      await refreshRating(tx, stay.listingId)
    })
  } catch (error) {
    if (isUniqueError(error)) throw conflict('already_reviewed', 'You’ve already reviewed this stay. Thank you!')
    throw error
  }
}

export async function listHostReviews(actor: Actor) {
  const host = requireHost(actor, { write: false })
  return repo.listForHost(http, host.id, 50)
}

export async function replyToReview(actor: Actor, reviewId: string, reply: string): Promise<void> {
  const host = requireHost(actor, { write: true })
  const ok = await repo.setHostReply(http, host.id, reviewId, reply)
  if (!ok) throw notFound('Review')
}
