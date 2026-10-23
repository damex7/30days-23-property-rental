// SERVER ACTIONS for a guest's trips: cancel, and leave a review.
'use server'

import { refresh } from 'next/cache'
import { formValues, fromServiceError, fromZodError, readUuid, succeeded } from '@/lib/action-helpers'
import { formatNaira } from '@/lib/money'
import { reviewSchema } from '@/lib/schemas'
import { cancelMyTrip } from '@/lib/services/bookings'
import { leaveReview } from '@/lib/services/reviews'
import { requirePageActor } from '@/lib/services/session-actor'
import { failed, type FormState } from '@/lib/validation'

export async function cancelTripAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const id = readUuid(formData)
  if (!id) return failed('That trip couldn’t be found.')
  let preview
  try {
    preview = await cancelMyTrip(actor, id)
  } catch (error) {
    return fromServiceError(error)
  }
  refresh()
  return succeeded(preview.refundKobo > 0 ? `Cancelled. A refund of ${formatNaira(preview.refundKobo)} is recorded and pending.` : 'Cancelled. The nights are released.')
}

const REVIEW_FIELDS = ['overall', 'cleanliness', 'location', 'value', 'powerSupply', 'comment'] as const

export async function reviewAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const id = readUuid(formData)
  const values = formValues(formData, REVIEW_FIELDS)
  if (!id) return failed('That trip couldn’t be found.', values)
  const parsed = reviewSchema.safeParse(values)
  if (!parsed.success) return fromZodError(parsed.error, values)
  try {
    await leaveReview(actor, id, parsed.data)
  } catch (error) {
    return fromServiceError(error, values)
  }
  refresh()
  return succeeded('Thank you! Your review is published on the listing.')
}
