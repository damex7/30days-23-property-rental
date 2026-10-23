// PAYMENTS: Paystack's answer becomes a confirmed stay EXACTLY ONCE
// (Day 22's fulfilOrder, for stays).
//
// confirmStay() is the single place a payment turns into a booking. Both
// the browser callback (/api/payments/callback) and the webhook
// (/api/webhooks/paystack) call it, in any order, possibly at the same
// instant. Exactly-once comes from three guards:
//   1. SELECT ... FOR UPDATE on the payment and stay rows: the second
//      caller waits for the first to commit, then sees what it did;
//   2. a conditional UPDATE stays ... WHERE status = 'held': only one caller
//      can flip it;
//   3. payments_one_success_per_stay, a partial unique index: the database
//      itself refuses a second 'success' row for the same stay.
// Before anything is confirmed, the amount, currency and reference must
// match what WE stored at Reserve. A payment that can't be honoured (the
// wrong amount; or it arrived after the hold expired and someone else took
// the nights) is recorded, FLAGGED, and a pending refund is created.
import 'server-only'

import { createHash } from 'node:crypto'
import { isExclusionError } from '@/lib/db/errors'
import type { Db } from '@/lib/db/executor'
import { http } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { withTransaction } from '@/lib/db/tx'
import { verifyTransaction, verifyWebhookSignature, webhookPayload, type PaystackTransaction } from '@/lib/payments/paystack'
import * as paymentsRepo from '@/lib/repos/payments'
import * as staysRepo from '@/lib/repos/stays'
import type { SystemActor } from './actor'

export type ConfirmResult =
  | { result: 'confirmed'; stayId: string; late: boolean }
  | { result: 'already_confirmed'; stayId: string }
  | { result: 'not_successful'; stayId: string }
  | { result: 'refund_pending'; stayId: string; reason: string }
  | { result: 'unknown_reference' }

async function unhonoured(tx: Db, locked: paymentsRepo.LockedPayment, paid: PaystackTransaction, reason: string): Promise<ConfirmResult> {
  await paymentsRepo.markPaymentSuccess(tx, locked.paymentId, { id: paid.id, channel: paid.channel ?? null, gatewayResponse: paid.gateway_response ?? null, paidAt: paid.paid_at ?? null })
  await paymentsRepo.flagPayment(tx, locked.paymentId, reason)
  if (paid.amount > 0) {
    await paymentsRepo.insertRefund(tx, { stayId: locked.stayId, paymentId: locked.paymentId, amountKobo: paid.amount, kind: 'unhonoured_payment', reason })
  }
  console.error(`[payments] UNHONOURED ${paid.reference}: ${reason}`)
  return { result: 'refund_pending', stayId: locked.stayId, reason }
}

export async function confirmStay(_system: SystemActor, reference: string, paid: PaystackTransaction): Promise<ConfirmResult> {
  return withTransaction(async (tx) => {
    // 1. Lock: a racing callback or webhook waits here until we commit.
    const locked = await paymentsRepo.lockByReference(tx, reference)
    if (!locked) {
      console.error(`[payments] unknown reference ${reference}`)
      return { result: 'unknown_reference' } as const
    }
    if (locked.paymentStatus === 'success') return { result: 'already_confirmed', stayId: locked.stayId } as const

    if (paid.status !== 'success') {
      await paymentsRepo.markPaymentFailed(tx, locked.paymentId, paid.gateway_response ?? paid.status)
      return { result: 'not_successful', stayId: locked.stayId } as const
    }

    // The money must be exactly what we asked for, in Naira, for this reference.
    if (paid.reference !== reference || paid.currency !== 'NGN' || paid.amount !== locked.paymentAmount || paid.amount !== locked.stayTotal) {
      const result = await unhonoured(tx, locked, paid, `Amount mismatch: paid ${paid.amount} ${paid.currency}, expected ${locked.paymentAmount} NGN`)
      // The hold is no longer trustworthy: release it so the nights are free.
      await staysRepo.moveStay(tx, locked.stayId, ['held'], 'cancelled', q`, cancelled_at = now(), cancelled_by = 'system'`)
      return result
    }

    if (locked.stayStatus === 'held') {
      // 2. Only one caller can make this flip.
      const flipped = await staysRepo.moveStay(tx, locked.stayId, ['held'], 'confirmed', q`, confirmed_at = now(), hold_expires_at = NULL`)
      if (!flipped) return { result: 'already_confirmed', stayId: locked.stayId } as const
      await paymentsRepo.markPaymentSuccess(tx, locked.paymentId, { id: paid.id, channel: paid.channel ?? null, gatewayResponse: paid.gateway_response ?? null, paidAt: paid.paid_at ?? null })
      return { result: 'confirmed', stayId: locked.stayId, late: false } as const
    }

    if (locked.stayStatus === 'expired') {
      // PAID AFTER THE HOLD EXPIRED (a slow bank, a closed tab). If the nights
      // are still free, the booking stands: moving it back to 'confirmed'
      // re-enters the exclusion constraint, which checks it like a new row.
      // If someone else booked them meanwhile, that UPDATE fails with 23P01:
      // undo just that step (a SAVEPOINT) and record a refund instead.
      await tx.query(q`SAVEPOINT revive`)
      try {
        await staysRepo.moveStay(tx, locked.stayId, ['expired'], 'confirmed', q`, confirmed_at = now(), hold_expires_at = NULL`)
        await tx.query(q`RELEASE SAVEPOINT revive`)
        await paymentsRepo.markPaymentSuccess(tx, locked.paymentId, { id: paid.id, channel: paid.channel ?? null, gatewayResponse: paid.gateway_response ?? null, paidAt: paid.paid_at ?? null })
        return { result: 'confirmed', stayId: locked.stayId, late: true } as const
      } catch (error) {
        if (!isExclusionError(error, 'stays_no_overlap')) throw error
        await tx.query(q`ROLLBACK TO SAVEPOINT revive`)
        return unhonoured(tx, locked, paid, 'Paid after the hold expired, and the nights had been booked by someone else')
      }
    }

    // Cancelled before the money arrived (the guest cancelled in another tab,
    // or Paystack initialise failed and we released the hold).
    return unhonoured(tx, locked, paid, `Paid for a stay that was already ${locked.stayStatus}`)
  })
}

/** The browser callback: never trust the query string; ask Paystack what happened, then confirm. */
export async function verifyAndConfirm(system: SystemActor, reference: string): Promise<ConfirmResult> {
  const paid = await verifyTransaction(reference)
  return confirmStay(system, reference, paid)
}

export type WebhookOutcome = { status: 200 | 400 | 401; body: Record<string, unknown>; confirm?: ConfirmResult }

/**
 * The webhook without the HTTP layer (so the check script can call it).
 * Signature first, on the RAW body: re-serialising parsed JSON could change
 * the bytes and break the HMAC.
 */
export async function handlePaystackWebhook(system: SystemActor, rawBody: string, signature: string | null): Promise<WebhookOutcome> {
  if (!verifyWebhookSignature(rawBody, signature)) return { status: 401, body: { error: 'bad signature' } }
  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return { status: 400, body: { error: 'bad json' } }
  }
  const parsed = webhookPayload.safeParse(json)
  if (!parsed.success) return { status: 400, body: { error: 'unexpected payload' } }
  const { event, data } = parsed.data

  // DEDUPE: Paystack retries until it gets a 200; the same delivery inserts nothing the second time.
  const dedupeKey = createHash('sha256').update(`paystack|${event}|${data.reference}|${data.id ?? ''}`).digest('hex')
  const stored = await paymentsRepo.storeWebhookEvent(http, { dedupeKey, eventType: event, reference: data.reference, payload: rawBody })
  if (!stored) return { status: 200, body: { ok: true, duplicate: true } }

  if (event !== 'charge.success') {
    await paymentsRepo.finishWebhookEvent(http, stored, null)
    return { status: 200, body: { ok: true, ignored: event } }
  }
  try {
    const confirm = await confirmStay(system, data.reference, {
      id: data.id ?? 0,
      status: data.status ?? '',
      reference: data.reference,
      amount: data.amount ?? -1,
      currency: data.currency ?? '',
      channel: data.channel ?? null,
      gateway_response: data.gateway_response ?? null,
      paid_at: data.paid_at ?? null,
    })
    await paymentsRepo.finishWebhookEvent(http, stored, confirm.result === 'confirmed' || confirm.result === 'already_confirmed' ? null : confirm.result)
    return { status: 200, body: { ok: true, result: confirm.result }, confirm }
  } catch (error) {
    // Let Paystack retry: forget this delivery so the retry isn't treated as a duplicate.
    await paymentsRepo.deleteWebhookEvent(http, stored)
    throw error
  }
}
