// CANCELLATION REFUNDS, worked out from the policy SNAPSHOTTED on the stay
// (a host switching to 'strict' later can't shrink this guest's refund).
// Pure, so the preview the guest sees before pressing "Cancel" and the
// refund actually recorded come from the same lines of code.
//
//   flexible : the full stay amount back up to 24 hours before check-in
//   moderate : the full stay amount back up to 5 days before check-in
//   strict   : HALF the stay amount back up to 7 days before, then nothing
//   always   : the caution deposit, in full (it's the guest's own money,
//              held against damage that can't happen on a cancelled stay)
//
// "Before check-in" means the listing's check-in TIME on the check-in date,
// in Lagos (14:00 on the 20th), not midnight and not the server's clock.
import { percentOf } from './money'
import type { CancellationPolicy } from './options'
import { lagosInstant, type IsoDate } from './time'

const HOUR = 3_600_000

const RULES: Record<CancellationPolicy, { hours: number; percent: number }> = {
  flexible: { hours: 24, percent: 100 },
  moderate: { hours: 5 * 24, percent: 100 },
  strict: { hours: 7 * 24, percent: 50 },
}

export type RefundPreview = {
  /** Whether the guest may still cancel (not once the stay has begun). */
  allowed: boolean
  percent: number
  stayRefundKobo: number
  depositRefundKobo: number
  refundKobo: number
  /** The last moment the better refund applies, or null once it's passed. */
  deadline: Date | null
  explanation: string
}

export function refundPreview(input: {
  policy: CancellationPolicy
  checkIn: IsoDate
  checkInTime: string
  paid: boolean
  totalKobo: number
  depositKobo: number
  now?: Date
}): RefundPreview {
  const now = input.now ?? new Date()
  const checkInAt = lagosInstant(input.checkIn, input.checkInTime)
  if (now >= checkInAt) {
    return { allowed: false, percent: 0, stayRefundKobo: 0, depositRefundKobo: 0, refundKobo: 0, deadline: null, explanation: 'Your stay has already begun, so it can’t be cancelled here. Please speak to your host.' }
  }
  if (!input.paid) {
    return { allowed: true, percent: 0, stayRefundKobo: 0, depositRefundKobo: 0, refundKobo: 0, deadline: null, explanation: 'You haven’t paid yet, so nothing is charged and nothing needs refunding. The nights are released straight away.' }
  }
  const rule = RULES[input.policy]
  const deadline = new Date(checkInAt.getTime() - rule.hours * HOUR)
  const inTime = now <= deadline
  const percent = inTime ? rule.percent : 0
  const stayAmount = input.totalKobo - input.depositKobo
  const stayRefundKobo = percentOf(stayAmount, percent)
  const depositRefundKobo = input.depositKobo
  const explanation = inTime
    ? `${percent}% of your stay${percent === 100 ? '' : ' amount'} is refunded because you’re cancelling before the deadline, plus your caution deposit.`
    : rule.percent === 100
      ? `It’s past the ${input.policy} policy’s deadline, so the stay amount isn’t refunded. Your caution deposit is.`
      : 'It’s within 7 days of check-in, so under the strict policy only your caution deposit is refunded.'
  return { allowed: true, percent, stayRefundKobo, depositRefundKobo, refundKobo: stayRefundKobo + depositRefundKobo, deadline: inTime ? deadline : null, explanation }
}
