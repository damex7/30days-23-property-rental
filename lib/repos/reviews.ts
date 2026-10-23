// REVIEWS: SQL only. Rules in lib/services/reviews.ts.
import 'server-only'

import { z } from 'zod'
import { one, rows, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { numeric } from './common'

const Averages = z.object({
  count: z.number().int(),
  overall: numeric.nullable(),
  cleanliness: numeric.nullable(),
  location: numeric.nullable(),
  value: numeric.nullable(),
  powerSupply: numeric.nullable(),
})
export type ReviewAverages = z.infer<typeof Averages>

/**
 * THE TRUTH about a listing's ratings: an aggregate over its reviews
 * (reviews_listing_idx). The listing page shows these exact figures; the
 * cached listings.rating_avg exists only so search can SORT by rating.
 */
export async function averagesFor(db: Db, listingId: string): Promise<ReviewAverages> {
  const result = await one(
    db,
    Averages,
    q`SELECT count(*)::int AS count,
             round(avg(overall), 2) AS overall, round(avg(cleanliness), 2) AS cleanliness,
             round(avg(location), 2) AS location, round(avg(value), 2) AS value, round(avg(power_supply), 2) AS "powerSupply"
      FROM reviews WHERE listing_id = ${listingId}`,
    'averagesFor',
  )
  return result ?? { count: 0, overall: null, cleanliness: null, location: null, value: null, powerSupply: null }
}

const Review = z.object({
  id: z.uuid(),
  overall: z.number().int(),
  cleanliness: z.number().int(),
  location: z.number().int(),
  value: z.number().int(),
  powerSupply: z.number().int(),
  comment: z.string(),
  hostReply: z.string().nullable(),
  guestFirstName: z.string(),
  stayMonth: z.string(),
  createdAt: z.date(),
})
export type Review = z.infer<typeof Review>

export async function listForListing(db: Db, listingId: string, limit: number): Promise<Review[]> {
  return rows(
    db,
    Review,
    q`SELECT r.id, r.overall, r.cleanliness, r.location, r.value, r.power_supply AS "powerSupply", r.comment, r.host_reply AS "hostReply",
             split_part(g.name, ' ', 1) AS "guestFirstName", to_char(lower(s.nights), 'Mon YYYY') AS "stayMonth", r.created_at AS "createdAt"
      FROM reviews r JOIN users g ON g.id = r.guest_id JOIN stays s ON s.id = r.stay_id
      WHERE r.listing_id = ${listingId}
      ORDER BY r.created_at DESC LIMIT ${limit}`,
    'listForListing',
  )
}

export async function insertReview(
  db: Db,
  input: { stayId: string; listingId: string; guestId: string; overall: number; cleanliness: number; location: number; value: number; powerSupply: number; comment: string },
): Promise<void> {
  await db.query(q`
    INSERT INTO reviews (stay_id, listing_id, guest_id, overall, cleanliness, location, value, power_supply, comment)
    VALUES (${input.stayId}, ${input.listingId}, ${input.guestId}, ${input.overall}, ${input.cleanliness}, ${input.location},
            ${input.value}, ${input.powerSupply}, ${input.comment})`)
}

/** The host's reply: only on a review of THEIR listing (the join checks host_id). */
export async function setHostReply(db: Db, hostId: string, reviewId: string, reply: string): Promise<boolean> {
  const result = await db.query(q`
    UPDATE reviews r SET host_reply = ${reply}, host_replied_at = now()
    FROM listings l
    WHERE r.id = ${reviewId} AND l.id = r.listing_id AND l.host_id = ${hostId}
    RETURNING r.id`)
  return result.length > 0
}

/** Reviews of a host's listings, for the host's reply page. */
export async function listForHost(db: Db, hostId: string, limit: number) {
  return rows(
    db,
    Review.extend({ listingTitle: z.string() }),
    q`SELECT r.id, r.overall, r.cleanliness, r.location, r.value, r.power_supply AS "powerSupply", r.comment, r.host_reply AS "hostReply",
             split_part(g.name, ' ', 1) AS "guestFirstName", to_char(lower(s.nights), 'Mon YYYY') AS "stayMonth", r.created_at AS "createdAt",
             l.title AS "listingTitle"
      FROM reviews r JOIN listings l ON l.id = r.listing_id JOIN users g ON g.id = r.guest_id JOIN stays s ON s.id = r.stay_id
      WHERE l.host_id = ${hostId}
      ORDER BY (r.host_reply IS NULL) DESC, r.created_at DESC LIMIT ${limit}`,
    'listForHost',
  )
}
