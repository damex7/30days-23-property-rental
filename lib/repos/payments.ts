// PAYMENTS, WEBHOOK EVENTS, REFUNDS AND THE EMAIL LOG: SQL only.
import 'server-only'

import { z } from 'zod'
import { one, rows, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { int8 } from './common'

export async function insertPayment(db: Db, input: { stayId: string; reference: string; amountKobo: number; provider?: 'paystack' | 'demo' }): Promise<string> {
  const result = await rows(
    db,
    z.object({ id: z.uuid() }),
    q`INSERT INTO payments (stay_id, reference, amount_kobo, provider)
      VALUES (${input.stayId}, ${input.reference}, ${input.amountKobo}, ${input.provider ?? 'paystack'})
      RETURNING id`,
    'insertPayment',
  )
  return result[0]!.id
}

export async function saveAuthorizationUrl(db: Db, reference: string, url: string): Promise<void> {
  await db.query(q`UPDATE payments SET authorization_url = ${url} WHERE reference = ${reference}`)
}

const Locked = z.object({
  paymentId: z.uuid(),
  paymentStatus: z.string(),
  paymentAmount: int8,
  stayId: z.uuid(),
  stayStatus: z.string(),
  stayTotal: int8.nullable(),
})
export type LockedPayment = z.infer<typeof Locked>

/**
 * Locks the payment AND its stay (FOR UPDATE OF p, s), so a racing browser
 * callback and webhook take turns: the second waits here until the first
 * commits, then sees what the first did.
 */
export async function lockByReference(db: Db, reference: string): Promise<LockedPayment | null> {
  return one(
    db,
    Locked,
    q`SELECT p.id AS "paymentId", p.status AS "paymentStatus", p.amount_kobo AS "paymentAmount",
             s.id AS "stayId", s.status AS "stayStatus", s.total_kobo AS "stayTotal"
      FROM payments p JOIN stays s ON s.id = p.stay_id
      WHERE p.reference = ${reference}
      FOR UPDATE OF p, s`,
    'lockByReference',
  )
}

export async function markPaymentSuccess(
  db: Db,
  paymentId: string,
  tx: { id: number; channel: string | null; gatewayResponse: string | null; paidAt: string | null },
): Promise<void> {
  await db.query(q`
    UPDATE payments SET status = 'success', provider_transaction_id = ${String(tx.id)}, channel = ${tx.channel},
           gateway_response = ${tx.gatewayResponse?.slice(0, 500) ?? null}, paid_at = coalesce(${tx.paidAt}::timestamptz, now())
    WHERE id = ${paymentId} AND status <> 'success'`)
}

export async function markPaymentFailed(db: Db, paymentId: string, response: string): Promise<void> {
  await db.query(q`UPDATE payments SET status = 'failed', gateway_response = ${response.slice(0, 500)} WHERE id = ${paymentId} AND status = 'initialized'`)
}

export async function flagPayment(db: Db, paymentId: string, note: string): Promise<void> {
  await db.query(q`UPDATE payments SET flagged = true, gateway_response = ${note.slice(0, 500)} WHERE id = ${paymentId}`)
}

/** The successful payment of a stay, if any (cancellation refunds need it). */
export async function successfulPayment(db: Db, stayId: string): Promise<{ id: string; amountKobo: number } | null> {
  return one(
    db,
    z.object({ id: z.uuid(), amountKobo: int8 }),
    q`SELECT id, amount_kobo AS "amountKobo" FROM payments WHERE stay_id = ${stayId} AND status = 'success'`,
    'successfulPayment',
  )
}

export async function insertRefund(
  db: Db,
  input: { stayId: string; paymentId: string; amountKobo: number; kind: 'cancellation' | 'unhonoured_payment'; reason: string; breakdown?: unknown },
): Promise<void> {
  await db.query(q`
    INSERT INTO refunds (stay_id, payment_id, amount_kobo, kind, reason, breakdown)
    VALUES (${input.stayId}, ${input.paymentId}, ${input.amountKobo}, ${input.kind}, ${input.reason},
            ${input.breakdown === undefined ? null : JSON.stringify(input.breakdown)}::jsonb)`)
}

export async function refundsFor(db: Db, stayId: string) {
  return rows(
    db,
    z.object({ amountKobo: int8, status: z.string(), kind: z.string(), reason: z.string(), createdAt: z.date() }),
    q`SELECT amount_kobo AS "amountKobo", status, kind, reason, created_at AS "createdAt" FROM refunds WHERE stay_id = ${stayId} ORDER BY created_at`,
    'refundsFor',
  )
}

/** Dedupe: inserts the event, or returns null if this exact delivery was already stored. */
export async function storeWebhookEvent(db: Db, input: { dedupeKey: string; eventType: string; reference: string; payload: string }): Promise<number | null> {
  const result = await rows(
    db,
    z.object({ id: z.coerce.number().int() }),
    q`INSERT INTO webhook_events (provider, dedupe_key, event_type, reference, payload)
      VALUES ('paystack', ${input.dedupeKey}, ${input.eventType.slice(0, 60)}, ${input.reference.slice(0, 100)}, ${input.payload}::jsonb)
      ON CONFLICT (provider, dedupe_key) DO NOTHING
      RETURNING id`,
    'storeWebhookEvent',
  )
  return result[0]?.id ?? null
}

export async function finishWebhookEvent(db: Db, id: number, error: string | null): Promise<void> {
  await db.query(q`UPDATE webhook_events SET processed_at = now(), error = ${error} WHERE id = ${id}`)
}

export async function deleteWebhookEvent(db: Db, id: number): Promise<void> {
  await db.query(q`DELETE FROM webhook_events WHERE id = ${id}`)
}

/** Claims an email before sending it. Returns the claim id, or null if it was already sent. */
export async function claimEmail(db: Db, kind: string, subjectId: string, to: string): Promise<number | null> {
  const result = await rows(
    db,
    z.object({ id: z.coerce.number().int() }),
    q`INSERT INTO email_log (kind, subject_id, sent_to) VALUES (${kind}, ${subjectId}, ${to})
      ON CONFLICT (kind, subject_id) DO NOTHING RETURNING id`,
    'claimEmail',
  )
  return result[0]?.id ?? null
}

export async function releaseEmailClaim(db: Db, id: number): Promise<void> {
  await db.query(q`DELETE FROM email_log WHERE id = ${id}`)
}
