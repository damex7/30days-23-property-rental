// SERVER ACTIONS for the host tools: parse with Zod, call ONE service,
// shape the answer. Every service re-checks who is asking and whether the
// listing is theirs; nothing here trusts a hidden field for that.
'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { formValues, fromServiceError, fromZodError, readUuid, succeeded } from '@/lib/action-helpers'
import { basicsSchema, blockSchema, hostReplySchema, locationSchema, nightsSelectionSchema, phoneSchema, priceRuleSchema, pricingSchema, rulesSchema, versionSchema, type ListingStep } from '@/lib/schemas'
import { addPriceRule, blockNights, removePriceRule, resetIcalLink, unblockNights } from '@/lib/services/calendar'
import { archiveListing, becomeHost, createDraft, deleteDraft, saveBasics, saveLocation, savePricing, saveRules, setPaused, submitForReview } from '@/lib/services/listings'
import { deleteBlobs, deletePhoto, recordPhoto, reorderPhotos, updatePhotoAlt } from '@/lib/services/photos'
import { replyToReview } from '@/lib/services/reviews'
import { requirePageActor } from '@/lib/services/session-actor'
import { failed, field, type FormState } from '@/lib/validation'
import { z } from 'zod'

const editUrl = (id: string, step: ListingStep, notice = 'saved') => `/host/listings/${id}/edit?step=${step}&notice=${notice}`

// ---------------------------------------------------------------------------
// Becoming a host
// ---------------------------------------------------------------------------

export async function becomeHostAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const values = { phone: field(formData, 'phone') }
  const parsed = phoneSchema.safeParse(values.phone)
  if (!parsed.success) return { status: 'error', message: 'Please fix the problem below.', fieldErrors: { phone: [parsed.error.issues[0]?.message ?? 'Enter your phone number'] }, values, submissionId: Date.now() }
  try {
    await becomeHost(actor, parsed.data)
  } catch (error) {
    return fromServiceError(error, values)
  }
  redirect('/host/listings/new?notice=welcome')
}

// ---------------------------------------------------------------------------
// The listing form, one action per step. Each saves a DRAFT and moves on.
// ---------------------------------------------------------------------------

const BASICS = ['title', 'description', 'propertyType', 'bedrooms', 'bathrooms', 'maxGuests'] as const
const LOCATION = ['state', 'city', 'area', 'addressLine', 'lat', 'lng'] as const
const PRICING = ['nightly', 'weekend', 'cleaningFee', 'cautionDeposit', 'weeklyDiscountPercent', 'minNights', 'maxNights', 'cancellationPolicy'] as const
const RULES = ['houseRules', 'checkInTime', 'checkOutTime', 'checkinInstructions'] as const

/** The listing id and version every edit form carries, or a "reload" error. */
function target(formData: FormData): { id: string; version: number } | null {
  const id = readUuid(formData)
  const version = versionSchema.safeParse(field(formData, 'version'))
  return id && version.success ? { id, version: version.data } : null
}

export async function createListingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const values = formValues(formData, BASICS)
  const parsed = basicsSchema.safeParse(values)
  if (!parsed.success) return fromZodError(parsed.error, values)
  let id
  try {
    id = await createDraft(actor, parsed.data)
  } catch (error) {
    return fromServiceError(error, values)
  }
  redirect(editUrl(id, 'location', 'draft'))
}

export async function saveBasicsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const values = formValues(formData, BASICS)
  const t = target(formData)
  if (!t) return failed('Reload the page and try again.', values)
  const parsed = basicsSchema.safeParse(values)
  if (!parsed.success) return fromZodError(parsed.error, values)
  try {
    await saveBasics(actor, t.id, t.version, parsed.data)
  } catch (error) {
    return fromServiceError(error, values)
  }
  redirect(editUrl(t.id, 'location'))
}

export async function saveLocationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const values = formValues(formData, LOCATION)
  const t = target(formData)
  if (!t) return failed('Reload the page and try again.', values)
  const parsed = locationSchema.safeParse(values)
  if (!parsed.success) return fromZodError(parsed.error, values)
  try {
    await saveLocation(actor, t.id, t.version, parsed.data)
  } catch (error) {
    return fromServiceError(error, values)
  }
  redirect(editUrl(t.id, 'photos'))
}

export async function savePricingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const values = formValues(formData, PRICING)
  const t = target(formData)
  if (!t) return failed('Reload the page and try again.', values)
  const parsed = pricingSchema.safeParse(values)
  if (!parsed.success) return fromZodError(parsed.error, values)
  try {
    await savePricing(actor, t.id, t.version, parsed.data)
  } catch (error) {
    return fromServiceError(error, values)
  }
  redirect(editUrl(t.id, 'rules'))
}

export async function saveRulesAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const values = formValues(formData, RULES)
  const t = target(formData)
  if (!t) return failed('Reload the page and try again.', values)
  const amenities = formData.getAll('amenity').map(String)
  const parsed = rulesSchema.safeParse({ ...values, amenities })
  if (!parsed.success) return fromZodError(parsed.error, { ...values, amenities: amenities.join(',') })
  try {
    await saveRules(actor, t.id, t.version, parsed.data)
  } catch (error) {
    return fromServiceError(error, values)
  }
  redirect(editUrl(t.id, 'review'))
}

export async function submitListingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const id = readUuid(formData)
  if (!id) return failed('Reload the page and try again.')
  try {
    await submitForReview(actor, id)
  } catch (error) {
    return fromServiceError(error)
  }
  redirect('/host/listings?notice=submitted')
}

export async function pauseListingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const id = readUuid(formData)
  if (!id) return failed('That listing couldn’t be found.')
  const paused = field(formData, 'paused') === 'true'
  try {
    await setPaused(actor, id, paused)
  } catch (error) {
    return fromServiceError(error)
  }
  refresh()
  return succeeded(paused ? 'Paused. Guests can’t find or book it until you publish it again.' : 'Published again.')
}

export async function archiveListingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const id = readUuid(formData)
  if (!id) return failed('That listing couldn’t be found.')
  try {
    await archiveListing(actor, id)
  } catch (error) {
    return fromServiceError(error)
  }
  refresh()
  return succeeded('Archived. Past guests’ trips and reviews are kept.')
}

export async function deleteDraftAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const id = readUuid(formData)
  if (!id) return failed('That listing couldn’t be found.')
  let blobs
  try {
    blobs = await deleteDraft(actor, id)
  } catch (error) {
    return { ...fromServiceError(error), offerArchive: true }
  }
  // The rows are gone (committed); now the files.
  await deleteBlobs(blobs)
  refresh()
  return succeeded('Draft deleted.')
}

// ---------------------------------------------------------------------------
// Photos (called from the photo manager, a client component)
// ---------------------------------------------------------------------------

const recordSchema = z.object({ listingId: z.uuid(), url: z.url().max(500), width: z.number().int().min(1).max(20000), height: z.number().int().min(1).max(20000), alt: z.string().trim().min(5, 'Describe the photo in at least 5 characters').max(200) })

export type PhotoActionResult = { ok: true; id?: string } | { ok: false; message: string }

async function photoAction(work: () => Promise<string | void>): Promise<PhotoActionResult> {
  try {
    const id = await work()
    refresh()
    return id ? { ok: true, id } : { ok: true }
  } catch (error) {
    const state = fromServiceError(error)
    return { ok: false, message: state.message ?? 'That didn’t work. Please try again.' }
  }
}

export async function recordPhotoAction(input: z.input<typeof recordSchema>): Promise<PhotoActionResult> {
  const actor = await requirePageActor()
  const parsed = recordSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'That photo couldn’t be saved.' }
  return photoAction(() => recordPhoto(actor, parsed.data.listingId, parsed.data))
}

export async function updateAltAction(listingId: string, photoId: string, alt: string): Promise<PhotoActionResult> {
  const actor = await requirePageActor()
  const parsed = z.object({ listingId: z.uuid(), photoId: z.uuid(), alt: z.string().trim().min(5, 'Describe the photo in at least 5 characters').max(200) }).safeParse({ listingId, photoId, alt })
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the description.' }
  return photoAction(() => updatePhotoAlt(actor, parsed.data.listingId, parsed.data.photoId, parsed.data.alt))
}

export async function reorderPhotosAction(listingId: string, ids: string[]): Promise<PhotoActionResult> {
  const actor = await requirePageActor()
  const parsed = z.object({ listingId: z.uuid(), ids: z.array(z.uuid()).min(1).max(12) }).safeParse({ listingId, ids })
  if (!parsed.success) return { ok: false, message: 'Reload the page and try again.' }
  return photoAction(() => reorderPhotos(actor, parsed.data.listingId, parsed.data.ids))
}

export async function deletePhotoAction(listingId: string, photoId: string): Promise<PhotoActionResult> {
  const actor = await requirePageActor()
  const parsed = z.object({ listingId: z.uuid(), photoId: z.uuid() }).safeParse({ listingId, photoId })
  if (!parsed.success) return { ok: false, message: 'Reload the page and try again.' }
  return photoAction(() => deletePhoto(actor, parsed.data.listingId, parsed.data.photoId))
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export async function calendarAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const id = readUuid(formData)
  const values = { first: field(formData, 'first'), last: field(formData, 'last'), note: field(formData, 'note'), nightly: field(formData, 'nightly'), label: field(formData, 'label') }
  if (!id) return failed('Reload the page and try again.', values)
  const nights = nightsSelectionSchema.safeParse(values)
  if (!nights.success) return fromZodError(nights.error, values)
  const intent = field(formData, 'intent')
  try {
    if (intent === 'block') {
      const note = blockSchema.parse({ note: values.note || undefined }).note ?? null
      await blockNights(actor, id, nights.data.first, nights.data.last, note)
      refresh()
      return succeeded('Those nights are blocked.')
    }
    if (intent === 'unblock') {
      const changed = await unblockNights(actor, id, nights.data.first, nights.data.last)
      refresh()
      return succeeded(changed ? 'Those nights are open again.' : 'None of those nights were blocked.')
    }
    if (intent === 'price') {
      const rule = priceRuleSchema.safeParse(values)
      if (!rule.success) return fromZodError(rule.error, values)
      if (rule.data.nightly === null) return failed('Enter the special nightly price.', values)
      await addPriceRule(actor, id, nights.data.first, nights.data.last, rule.data.nightly, rule.data.label)
      refresh()
      return succeeded(`Special price “${rule.data.label}” saved.`)
    }
  } catch (error) {
    return fromServiceError(error, values)
  }
  return failed('Choose what to do with those nights.', values)
}

export async function removePriceRuleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const id = readUuid(formData)
  const ruleId = readUuid(formData, 'ruleId')
  if (!id || !ruleId) return failed('Reload the page and try again.')
  try {
    await removePriceRule(actor, id, ruleId)
  } catch (error) {
    return fromServiceError(error)
  }
  refresh()
  return succeeded('Special price removed.')
}

export async function resetIcalAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const id = readUuid(formData)
  if (!id) return failed('Reload the page and try again.')
  try {
    await resetIcalLink(actor, id)
  } catch (error) {
    return fromServiceError(error)
  }
  refresh()
  return succeeded('New link made. The old one has stopped working: update it wherever you pasted it.')
}

export async function replyAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePageActor()
  const id = readUuid(formData)
  const values = { reply: field(formData, 'reply') }
  if (!id) return failed('Reload the page and try again.', values)
  const parsed = hostReplySchema.safeParse(values)
  if (!parsed.success) return fromZodError(parsed.error, values)
  try {
    await replyToReview(actor, id, parsed.data.reply)
  } catch (error) {
    return fromServiceError(error, values)
  }
  refresh()
  return succeeded('Reply published.')
}
