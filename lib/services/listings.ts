// LISTINGS: the rules for reading and managing them.
//
// OWNERSHIP, layer 1 (this file): every host function reads and writes
// through repo calls that filter on host_id = the signed-in host. Someone
// else's listing id finds no row, and that is answered with notFound(),
// exactly like an id that doesn't exist (a 404, never a 403: "forbidden"
// would confirm the listing is real, and whose it is).
// OWNERSHIP, layer 2 (the database): the composite foreign keys in
// db/migrations/007-008 refuse a photo, price rule or block whose host_id
// isn't the listing's host, even if this file had a bug.
import 'server-only'

import { randomBytes } from 'node:crypto'
import { http, type Db } from '@/lib/db/executor'
import { isReferencedError } from '@/lib/db/errors'
import { q, type Sql } from '@/lib/db/sql'
import { withTransaction } from '@/lib/db/tx'
import * as admin from '@/lib/repos/admin'
import * as repo from '@/lib/repos/listings'
import type { BasicsInput, LocationInput, PricingInput, RulesInput } from '@/lib/schemas'
import type { User } from '@/lib/rows'
import { requireHost, requireUser, type Actor } from './actor'
import { conflict, forbidden, invalid, notFound, staleVersion } from './errors'

// ---------------------------------------------------------------------------
// Public (visitors welcome: actor may be null)
// ---------------------------------------------------------------------------

/** A published listing for /stays/[slug]. Exact location is not in this shape at all (lib/repos/listings.ts). */
export async function getPublicListing(_actor: Actor, slug: string): Promise<repo.PublicListing> {
  const listing = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? await repo.getPublicListingBySlug(http, slug) : null
  if (!listing) throw notFound('Listing')
  return listing
}

export async function getPublicListingById(_actor: Actor, id: string): Promise<repo.PublicListing> {
  const listing = await repo.getPublicListingById(http, id)
  if (!listing) throw notFound('Listing')
  return listing
}

export function listFeatured(_actor: Actor, limit = 6) {
  return repo.listFeatured(http, limit)
}

export function listAreas(_actor: Actor) {
  return repo.listAreas(http)
}

export function listAmenities(_actor: Actor) {
  return repo.listAmenities(http)
}

// ---------------------------------------------------------------------------
// Becoming a host
// ---------------------------------------------------------------------------

/**
 * Any signed-in guest can become a host (/host/start). Their phone number is
 * required: it's what a confirmed guest calls on arrival. The role change
 * and the audit event are one statement.
 */
export async function becomeHost(actor: Actor, phone: string): Promise<void> {
  const user = requireUser(actor)
  if (user.isDemo) throw forbidden('demo_read_only', 'Demo guests can’t become hosts. Use “Look around as a host” on the home page to see the host tools.')
  if (user.role === 'admin') return
  await http.query(q`
    WITH updated AS (UPDATE users SET role = 'host', phone = ${phone} WHERE id = ${user.id} AND role IN ('guest', 'host') RETURNING id)
    INSERT INTO auth_events (user_id, type, metadata)
    SELECT id, 'became_host', '{}'::jsonb FROM updated`)
}

// ---------------------------------------------------------------------------
// The host's own listings
// ---------------------------------------------------------------------------

export async function listMyListings(actor: Actor): Promise<repo.HostListing[]> {
  const host = requireHost(actor, { write: false })
  return repo.listHostListings(http, host.id)
}

/** One of MY listings, or 404 (missing and not-mine look the same). */
export async function getMyListing(actor: Actor, listingId: string): Promise<repo.HostListing> {
  const host = requireHost(actor, { write: false })
  const listing = isUuid(listingId) ? await repo.getHostListing(http, host.id, listingId) : null
  if (!listing) throw notFound('Listing')
  return listing
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/** "Two-bed in Lekki" → "two-bed-in-lekki" (and a short random tail if that's taken). */
export function slugify(text: string): string {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70)
      .replace(/-+$/, '') || 'stay'
  )
}

/** Step 1 creates the draft; every later step updates it. */
export async function createDraft(actor: Actor, input: BasicsInput): Promise<string> {
  const host = requireHost(actor, { write: true })
  const base = slugify(input.title)
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`
    const id = await repo.insertDraft(http, host.id, { ...input, slug })
    if (id) return id
  }
  throw conflict('slug_taken', 'Couldn’t find a free web address for that title. Try a slightly different title.')
}

/** Runs one step's save under optimistic concurrency, answering a stale version with the latest values. */
async function saveStep(host: User, listingId: string, version: number, set: Sql, extra?: (tx: Db) => Promise<void>): Promise<number> {
  return withTransaction(async (tx) => {
    const next = await repo.updateListingFields(tx, host.id, listingId, version, set)
    if (next === null) {
      const current = await repo.getHostListing(tx, host.id, listingId)
      if (!current) throw notFound('Listing')
      if (current.status === 'archived') throw conflict('archived', 'This listing is archived, so it can’t be edited.')
      throw staleVersion('listing', { version: current.version })
    }
    if (extra) await extra(tx)
    return next
  })
}

export async function saveBasics(actor: Actor, listingId: string, version: number, input: BasicsInput): Promise<number> {
  const host = requireHost(actor, { write: true })
  return saveStep(
    host,
    listingId,
    version,
    q`title = ${input.title}, description = ${input.description}, property_type = ${input.propertyType},
      bedrooms = ${input.bedrooms}, bathrooms = ${input.bathrooms}, max_guests = ${input.maxGuests}`,
  )
}

export async function saveLocation(actor: Actor, listingId: string, version: number, input: LocationInput): Promise<number> {
  const host = requireHost(actor, { write: true })
  return saveStep(
    host,
    listingId,
    version,
    q`state = ${input.state}, city = ${input.city}, area = ${input.area}, address_line = ${input.addressLine},
      lat = round(${input.lat}::numeric, 6), lng = round(${input.lng}::numeric, 6)`,
  )
}

export async function savePricing(actor: Actor, listingId: string, version: number, input: PricingInput): Promise<number> {
  const host = requireHost(actor, { write: true })
  return saveStep(
    host,
    listingId,
    version,
    q`nightly_kobo = ${input.nightly}, weekend_kobo = ${input.weekend}, cleaning_fee_kobo = ${input.cleaningFee},
      caution_deposit_kobo = ${input.cautionDeposit}, weekly_discount_percent = ${input.weeklyDiscountPercent},
      min_nights = ${input.minNights}, max_nights = ${input.maxNights}, cancellation_policy = ${input.cancellationPolicy}`,
  )
}

export async function saveRules(actor: Actor, listingId: string, version: number, input: RulesInput): Promise<number> {
  const host = requireHost(actor, { write: true })
  return saveStep(
    host,
    listingId,
    version,
    q`house_rules = ${input.houseRules}, check_in_time = ${input.checkInTime}::time, check_out_time = ${input.checkOutTime}::time,
      checkin_instructions = ${input.checkinInstructions}`,
    (tx) => repo.replaceAmenities(tx, listingId, input.amenities),
  )
}

/** What's still missing before a listing can be sent for review (shown on the review step). */
export function missingForReview(listing: repo.HostListing, host: User): string[] {
  const missing: string[] = []
  if (!listing.area || !listing.addressLine || listing.lat === null) missing.push('the location (step 2)')
  if (listing.photoCount < 3) missing.push(`at least 3 photos (you have ${listing.photoCount})`)
  if (listing.nightlyKobo === null) missing.push('a nightly price (step 4)')
  if (listing.amenities.length === 0) missing.push('at least one amenity (step 5)')
  if (!host.phone) missing.push('your phone number (on /host/start), for confirmed guests')
  return missing
}

/** draft or rejected → pending_review, with an audit event. The admin reviews it next. */
export async function submitForReview(actor: Actor, listingId: string): Promise<void> {
  const host = requireHost(actor, { write: true })
  await withTransaction(async (tx) => {
    const listing = await repo.getHostListing(tx, host.id, listingId, { forUpdate: true })
    if (!listing) throw notFound('Listing')
    if (listing.status !== 'draft' && listing.status !== 'rejected') throw conflict('not_submittable', 'This listing has already been submitted.')
    const missing = missingForReview(listing, host)
    if (missing.length > 0) throw invalid('incomplete', `Before submitting, add ${missing.join(', ')}.`)
    await repo.setStatus(tx, listingId, ['draft', 'rejected'], 'pending_review', q`, submitted_at = now(), rejection_reason = NULL`, host.id)
    await admin.insertAudit(tx, { actorId: host.id, action: 'listing_submitted', listingId })
  })
}

/** published ↔ paused, by the host. A suspended host can't unpause (requireHost refuses their writes). */
export async function setPaused(actor: Actor, listingId: string, paused: boolean): Promise<void> {
  const host = requireHost(actor, { write: true })
  await withTransaction(async (tx) => {
    const ok = paused
      ? await repo.setStatus(tx, listingId, ['published'], 'paused', undefined, host.id)
      : await repo.setStatus(tx, listingId, ['paused'], 'published', q`, published_at = coalesce(published_at, now())`, host.id)
    if (!ok) {
      const listing = await repo.getHostListing(tx, host.id, listingId)
      if (!listing) throw notFound('Listing')
      throw conflict('wrong_status', paused ? 'Only a published listing can be paused.' : 'Only a paused listing can be published again.')
    }
    await admin.insertAudit(tx, { actorId: host.id, action: paused ? 'listing_paused' : 'listing_unpaused', listingId })
  })
}

/**
 * Retiring a listing. It's ARCHIVED, never deleted, once it has any stay:
 * its guests' trips, receipts and reviews point at it (stays.listing_id is
 * ON DELETE RESTRICT). Refused while a confirmed stay is still to come.
 */
export async function archiveListing(actor: Actor, listingId: string): Promise<void> {
  const host = requireHost(actor, { write: true })
  await withTransaction(async (tx) => {
    const listing = await repo.getHostListing(tx, host.id, listingId, { forUpdate: true })
    if (!listing) throw notFound('Listing')
    const upcoming = await tx.query(q`
      SELECT 1 FROM stays WHERE listing_id = ${listingId} AND kind = 'booking' AND status IN ('held', 'confirmed')
        AND upper(nights) > (now() AT TIME ZONE 'Africa/Lagos')::date LIMIT 1`)
    if (upcoming.length > 0) throw conflict('has_upcoming', 'This listing has upcoming bookings. Pause it instead, and archive it once they’re over.')
    await repo.setStatus(tx, listingId, ['draft', 'pending_review', 'published', 'paused', 'rejected'], 'archived', undefined, host.id)
    await admin.insertAudit(tx, { actorId: host.id, action: 'listing_archived', listingId })
  })
}

/** A draft can be deleted outright. Returns the blob pathnames for the caller to delete AFTER the commit. */
export async function deleteDraft(actor: Actor, listingId: string): Promise<string[]> {
  const host = requireHost(actor, { write: true })
  const listing = await getMyListing(host, listingId)
  if (listing.status !== 'draft') throw conflict('not_draft', 'Only drafts can be deleted. Archive this listing instead.')
  const photos = await http.query(q`SELECT blob_url FROM listing_photos WHERE listing_id = ${listingId} AND host_id = ${host.id}`)
  try {
    const ok = await repo.deleteDraft(http, host.id, listingId)
    if (!ok) throw notFound('Listing')
  } catch (error) {
    if (isReferencedError(error)) throw conflict('has_stays', 'This draft has calendar entries, so archive it instead.')
    throw error
  }
  return photos.map((p) => String(p.blob_url))
}
