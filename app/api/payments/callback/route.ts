// GET /api/payments/callback?reference=…  (Paystack sends the guest's browser here)
//
// NEVER TRUST THE REDIRECT: anyone can type ?reference=SB-... into a URL.
// verifyAndConfirm asks Paystack's verify endpoint what really happened,
// then runs the same exactly-once confirmStay() as the webhook. The guest
// lands on their trip page either way; if the verify call fails, the trip
// page shows "waiting for payment" and the webhook can still confirm it.
import { after, NextResponse, type NextRequest } from 'next/server'
import { appUrl } from '@/lib/auth/email'
import { systemActor } from '@/lib/services/actor'
import { sendConfirmationEmails } from '@/lib/services/notifications'
import { verifyAndConfirm } from '@/lib/services/payments'

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get('reference') ?? request.nextUrl.searchParams.get('trxref')
  if (!reference || !/^SB-[A-Z0-9-]{6,40}$/.test(reference)) return NextResponse.redirect(appUrl('/trips'), 303)
  try {
    const result = await verifyAndConfirm(systemActor('Paystack'), reference)
    if (result.result === 'confirmed') after(() => sendConfirmationEmails(result.stayId))
    if (result.result !== 'unknown_reference') {
      const notice = result.result === 'refund_pending' ? 'payment-unhonoured' : result.result === 'not_successful' ? 'payment-failed' : 'booked'
      return NextResponse.redirect(appUrl(`/trips/${result.stayId}?notice=${notice}`), 303)
    }
  } catch (error) {
    console.error('[callback] verify failed:', error instanceof Error ? error.message : error)
  }
  return NextResponse.redirect(appUrl('/trips?notice=payment-pending'), 303)
}
