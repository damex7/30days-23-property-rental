// POST /api/webhooks/paystack: Paystack calls this server to server.
//
// We read the RAW body (request.text()) because the x-paystack-signature
// header is an HMAC-SHA512 of the exact bytes sent; parsing and
// re-stringifying the JSON could change them. Emails go out after the
// response (after()), so Paystack gets its 200 quickly and doesn't retry.
// Set the webhook URL in the Paystack dashboard: <APP_URL>/api/webhooks/paystack
import { after, NextResponse, type NextRequest } from 'next/server'
import { systemActor } from '@/lib/services/actor'
import { sendConfirmationEmails } from '@/lib/services/notifications'
import { handlePaystackWebhook } from '@/lib/services/payments'

export async function POST(request: NextRequest) {
  const raw = await request.text()
  try {
    const outcome = await handlePaystackWebhook(systemActor('Paystack'), raw, request.headers.get('x-paystack-signature'))
    const confirm = outcome.confirm
    if (confirm?.result === 'confirmed') after(() => sendConfirmationEmails(confirm.stayId))
    return NextResponse.json(outcome.body, { status: outcome.status })
  } catch (error) {
    console.error('[webhook] failed:', error)
    // A 500 makes Paystack retry later.
    return NextResponse.json({ error: 'temporary failure' }, { status: 500 })
  }
}
