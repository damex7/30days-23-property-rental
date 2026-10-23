// PAYSTACK: the ONLY file that talks to Paystack (Day 22's client).
// Everything coming back is parsed with Zod, so the rest of the app works
// with typed, checked data and never trusts a field it didn't validate.
// Docs: https://paystack.com/docs/api/transaction/ (NGN amounts are in kobo).
import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const BASE = 'https://api.paystack.co'

/** Paystack's documented TEST card (test mode only), shown in the demo banner. */
export const TEST_CARD = { number: '4084 0840 8408 4081', expiry: 'Any future date', cvv: '408', pin: '0000', otp: '123456' } as const

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not set. Add your Paystack TEST secret key (sk_test_...) to .env.local.')
  return key
}

const initializeResponse = z.object({
  status: z.boolean(),
  message: z.string(),
  data: z.object({ authorization_url: z.url(), access_code: z.string(), reference: z.string() }),
})

export const paystackTransaction = z.object({
  id: z.number(),
  status: z.string(), // "success", "failed", "abandoned", ...
  reference: z.string(),
  amount: z.number().int(), // kobo
  currency: z.string(),
  channel: z.string().nullish(),
  gateway_response: z.string().nullish(),
  paid_at: z.string().nullish(),
})
export type PaystackTransaction = z.infer<typeof paystackTransaction>

const verifyResponse = z.object({ status: z.boolean(), message: z.string(), data: paystackTransaction })

export const webhookPayload = z.object({
  event: z.string(),
  data: paystackTransaction.partial().extend({ reference: z.string() }).loose(),
})

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json', ...init.headers },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`Paystack ${path} failed with ${response.status}: ${JSON.stringify(json)}`)
  return json
}

/** Starts a transaction for EXACTLY the amount we worked out, and returns the checkout page's URL. */
export async function initializeTransaction(input: {
  email: string
  amountKobo: number
  reference: string
  callbackUrl: string
  metadata: Record<string, string>
}): Promise<{ authorizationUrl: string }> {
  const json = await call('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      currency: 'NGN',
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }),
  })
  return { authorizationUrl: initializeResponse.parse(json).data.authorization_url }
}

/** Ask Paystack directly what happened. This, not the browser's query string, is the truth. */
export async function verifyTransaction(reference: string): Promise<PaystackTransaction> {
  const json = await call(`/transaction/verify/${encodeURIComponent(reference)}`)
  return verifyResponse.parse(json).data
}

/** x-paystack-signature = HMAC-SHA512 of the RAW request body, keyed with the secret key. */
export function signWebhookBody(rawBody: string, secret = secretKey()): string {
  return createHmac('sha512', secret).update(rawBody).digest('hex')
}

export function verifyWebhookSignature(rawBody: string, signature: string | null, secret = secretKey()): boolean {
  if (!signature) return false
  const expected = Buffer.from(signWebhookBody(rawBody, secret), 'utf8')
  const given = Buffer.from(signature, 'utf8')
  // timingSafeEqual needs equal lengths; comparing lengths first leaks only the length, which is public.
  return expected.length === given.length && timingSafeEqual(expected, given)
}
