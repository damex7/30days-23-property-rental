// ADMIN: the listing review queue, host suspension, all bookings, cron
// history. Every decision is written to audit_events in the SAME
// transaction as the change, so there is never a change without its record.
import 'server-only'

import { http } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { withTransaction } from '@/lib/db/tx'
import * as repo from '@/lib/repos/admin'
import * as listingsRepo from '@/lib/repos/listings'
import * as photosRepo from '@/lib/repos/photos'
import * as staysRepo from '@/lib/repos/stays'
import { requireAdmin, type Actor } from './actor'
import { conflict, notFound } from './errors'
import { sendListingDecision } from './notifications'

export async function getAdminOverview(actor: Actor) {
  requireAdmin(actor)
  const [pending, hosts, bookings, cronRuns, audit] = await Promise.all([
    repo.listPendingListings(http),
    repo.listHosts(http),
    staysRepo.listAllStays(http, 50),
    repo.listCronRuns(http, 10),
    repo.listAudit(http, 20),
  ])
  return { pending, hosts, bookings, cronRuns, audit }
}

/** One pending listing in full, so the admin can check it before deciding. */
export async function getListingForReview(actor: Actor, listingId: string) {
  requireAdmin(actor)
  const listing = /^[0-9a-f-]{36}$/i.test(listingId) ? await listingsRepo.getListingForAdmin(http, listingId) : null
  if (!listing) throw notFound('Listing')
  return { listing, photos: await photosRepo.listPhotos(http, listing.hostId, listing.id) }
}

async function hostOf(listingId: string) {
  const rows = await http.query(q`SELECT l.id, l.title, l.version, u.email::text AS email, u.name FROM listings l JOIN users u ON u.id = l.host_id WHERE l.id = ${listingId}`)
  const row = rows[0]
  return row ? { id: String(row.id), title: String(row.title), version: Number(row.version), hostEmail: String(row.email), hostName: String(row.name) } : null
}

export async function approveListing(actor: Actor, listingId: string): Promise<void> {
  const admin = requireAdmin(actor)
  await withTransaction(async (tx) => {
    const ok = await listingsRepo.setStatus(tx, listingId, ['pending_review'], 'published', q`, published_at = coalesce(published_at, now()), rejection_reason = NULL`)
    if (!ok) throw conflict('not_pending', 'That listing isn’t waiting for review any more.')
    await repo.insertAudit(tx, { actorId: admin.id, action: 'listing_approved', listingId })
  })
  const listing = await hostOf(listingId)
  if (listing) await sendListingDecision(listing, { approved: true })
}

export async function rejectListing(actor: Actor, listingId: string, reason: string): Promise<void> {
  const admin = requireAdmin(actor)
  await withTransaction(async (tx) => {
    const ok = await listingsRepo.setStatus(tx, listingId, ['pending_review'], 'rejected', q`, rejection_reason = ${reason}`)
    if (!ok) throw conflict('not_pending', 'That listing isn’t waiting for review any more.')
    await repo.insertAudit(tx, { actorId: admin.id, action: 'listing_rejected', listingId, metadata: { reason } })
  })
  // The reason is EMAILED to the host (and shown on their listing).
  const listing = await hostOf(listingId)
  if (listing) await sendListingDecision(listing, { approved: false, reason })
}

/** Suspends a host: the flag and the pausing of their listings in ONE statement (lib/repos/admin.ts). */
export async function suspendHost(actor: Actor, hostId: string): Promise<number> {
  const admin = requireAdmin(actor)
  return withTransaction(async (tx) => {
    const result = await repo.suspendHost(tx, hostId)
    if (!result) throw conflict('not_suspendable', 'That host is already suspended, or isn’t a host.')
    await repo.insertAudit(tx, { actorId: admin.id, action: 'host_suspended', targetUserId: hostId, metadata: { listingsPaused: result.paused } })
    return result.paused
  })
}

export async function unsuspendHost(actor: Actor, hostId: string): Promise<void> {
  const admin = requireAdmin(actor)
  await withTransaction(async (tx) => {
    if (!(await repo.unsuspendHost(tx, hostId))) throw conflict('not_suspended', 'That host isn’t suspended.')
    await repo.insertAudit(tx, { actorId: admin.id, action: 'host_unsuspended', targetUserId: hostId })
  })
}
