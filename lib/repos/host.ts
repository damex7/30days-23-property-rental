// THE HOST DASHBOARD's numbers: SQL only.
import 'server-only'

import { z } from 'zod'
import { one, rows, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { int8, isoDate } from './common'

/**
 * OCCUPANCY THIS MONTH, worked out in SQL:
 *   booked nights ÷ available nights
 * generate_series makes one row per (published listing, night of this
 * Lagos month). A night is AVAILABLE unless the host blocked it; it's
 * BOOKED when a confirmed or completed booking covers it (@> = "the range
 * contains this date"). Blocked nights are left out of both sides, so
 * blocking your own flat for a family visit doesn't lower your occupancy.
 */
export async function occupancyThisMonth(db: Db, hostId: string): Promise<{ booked: number; available: number; month: string }> {
  const result = await one(
    db,
    z.object({ booked: z.number().int(), available: z.number().int(), month: z.string() }),
    q`WITH bounds AS (
        SELECT date_trunc('month', now() AT TIME ZONE 'Africa/Lagos')::date AS first,
               (date_trunc('month', now() AT TIME ZONE 'Africa/Lagos') + interval '1 month')::date AS next
      ), nights AS (
        SELECT l.id AS listing_id, d::date AS night
        FROM listings l, bounds b, generate_series(b.first, b.next - 1, interval '1 day') AS d
        WHERE l.host_id = ${hostId} AND l.status = 'published'
      ), marked AS (
        SELECT n.*,
          EXISTS (SELECT 1 FROM stays s WHERE s.listing_id = n.listing_id AND s.kind = 'host_block' AND s.status = 'confirmed' AND s.nights @> n.night) AS blocked,
          EXISTS (SELECT 1 FROM stays s WHERE s.listing_id = n.listing_id AND s.kind = 'booking' AND s.status IN ('confirmed', 'completed') AND s.nights @> n.night) AS booked
        FROM nights n
      )
      SELECT count(*) FILTER (WHERE booked AND NOT blocked)::int AS booked,
             count(*) FILTER (WHERE NOT blocked)::int AS available,
             to_char((SELECT first FROM bounds), 'FMMonth YYYY') AS month
      FROM marked`,
    'occupancyThisMonth',
  )
  return result ?? { booked: 0, available: 0, month: '' }
}

/**
 * EARNINGS: what the host's guests paid for the STAY (nights − discount +
 * cleaning). Not the 5% service fee (the platform's) and not the caution
 * deposit (the guest's, refundable). Payouts are Day 25.
 */
export async function earnings(db: Db, hostId: string): Promise<{ allTimeKobo: number; thisMonthKobo: number; upcomingKobo: number }> {
  const result = await one(
    db,
    z.object({ allTimeKobo: int8, thisMonthKobo: int8, upcomingKobo: int8 }),
    q`SELECT
        coalesce(sum(subtotal_kobo - discount_kobo + cleaning_fee_kobo) FILTER (WHERE status = 'completed'), 0) AS "allTimeKobo",
        coalesce(sum(subtotal_kobo - discount_kobo + cleaning_fee_kobo) FILTER (WHERE status IN ('confirmed', 'completed')
          AND date_trunc('month', lower(nights)) = date_trunc('month', now() AT TIME ZONE 'Africa/Lagos')), 0) AS "thisMonthKobo",
        coalesce(sum(subtotal_kobo - discount_kobo + cleaning_fee_kobo) FILTER (WHERE status = 'confirmed'), 0) AS "upcomingKobo"
      FROM stays WHERE host_id = ${hostId} AND kind = 'booking'`,
    'earnings',
  )
  return result ?? { allTimeKobo: 0, thisMonthKobo: 0, upcomingKobo: 0 }
}

/** Price rules of a listing, for the calendar page. */
export async function listPriceRules(db: Db, hostId: string, listingId: string) {
  return rows(
    db,
    z.object({ id: z.uuid(), start: isoDate, end: isoDate, nightlyKobo: int8, label: z.string() }),
    q`SELECT id, lower(nights)::text AS start, upper(nights)::text AS "end", nightly_kobo AS "nightlyKobo", label
      FROM price_rules WHERE listing_id = ${listingId} AND host_id = ${hostId}
        AND upper(nights) > (now() AT TIME ZONE 'Africa/Lagos')::date
      ORDER BY lower(nights)`,
    'listPriceRules',
  )
}

export async function insertPriceRule(db: Db, input: { hostId: string; listingId: string; start: string; end: string; nightlyKobo: number; label: string }): Promise<void> {
  await db.query(q`INSERT INTO price_rules (listing_id, host_id, nights, nightly_kobo, label)
                   VALUES (${input.listingId}, ${input.hostId}, daterange(${input.start}::date, ${input.end}::date, '[)'), ${input.nightlyKobo}, ${input.label})`)
}

export async function deletePriceRule(db: Db, hostId: string, ruleId: string): Promise<boolean> {
  const result = await db.query(q`DELETE FROM price_rules WHERE id = ${ruleId} AND host_id = ${hostId} RETURNING id`)
  return result.length > 0
}
