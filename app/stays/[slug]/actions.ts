// SERVER ACTION for Reserve: parse, call the service, shape the answer.
// The form sends the listing, the dates, the guests and an Idempotency-Key.
// It does NOT send a price: the service works that out (lib/pricing.ts).
'use server'

import { redirect } from 'next/navigation'
import { fromServiceError, fromZodError } from '@/lib/action-helpers'
import { getRequestInfo } from '@/lib/auth/request'
import { reserveSchema } from '@/lib/schemas'
import { reserve } from '@/lib/services/bookings'
import { requirePageActor } from '@/lib/services/session-actor'
import { field, type FormState } from '@/lib/validation'

const FIELDS = ['listingId', 'checkIn', 'checkOut', 'guests'] as const

export async function reserveAction(_previous: FormState, formData: FormData): Promise<FormState> {
  // Signed out? verifySession sends them to /login?next=<this page with the dates>.
  const actor = await requirePageActor()
  const values = Object.fromEntries(FIELDS.map((name) => [name, field(formData, name)]))
  const parsed = reserveSchema.safeParse({ ...values, idempotencyKey: field(formData, 'idempotencyKey') })
  if (!parsed.success) return fromZodError(parsed.error, values)
  let result
  try {
    result = await reserve(actor, parsed.data, { ip: (await getRequestInfo()).ip })
  } catch (error) {
    return fromServiceError(error, values)
  }
  // To Paystack's checkout page, or (a replay of a confirmed booking) the trip.
  redirect(result.authorizationUrl ?? `/trips/${result.stayId}`)
}
