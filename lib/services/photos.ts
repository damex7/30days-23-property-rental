// LISTING PHOTOS: the rules for uploads, alt text, order and deletion.
//
// HOW AN UPLOAD WORKS (client uploads, README "How photo uploads are secured"):
//   1. The browser asks /api/photos/upload for a one-time TOKEN, saying which
//      listing and which (random) pathname. authorizeUpload() below checks:
//      signed in, the listing is THIS host's, it has room (< 12 photos), and
//      the pathname is listings/<that listing id>/<random>.<jpg|png|webp>.
//      The token itself carries the allowed types and the 5 MB limit, so
//      Vercel Blob refuses anything else.
//   2. The browser sends the FILE straight to Vercel Blob with that token.
//      The bytes never pass through our server function, so Vercel's ~4.5 MB
//      request body limit for functions doesn't apply, and a slow 5 MB upload
//      from a phone doesn't keep a function running (and billed).
//   3. The browser tells us the blob's URL with its alt text; recordPhoto()
//      checks the URL is OUR store and the pathname is under this listing,
//      then saves the row. (Not Blob's upload-completed callback: it can't
//      reach localhost, and this way the alt text arrives with the URL.)
import 'server-only'

import { del } from '@vercel/blob'
import { isCheckError, isUniqueError } from '@/lib/db/errors'
import { http } from '@/lib/db/executor'
import { withTransaction } from '@/lib/db/tx'
import { MAX_PHOTO_BYTES, MAX_PHOTOS, PHOTO_TYPES } from '@/lib/options'
import * as listingsRepo from '@/lib/repos/listings'
import * as repo from '@/lib/repos/photos'
import { requireHost, type Actor } from './actor'
import { conflict, invalid, notFound } from './errors'

const PATHNAME = /^listings\/([0-9a-f-]{36})\/[A-Za-z0-9_-]{16,64}\.(jpg|jpeg|png|webp)$/
const BLOB_URL = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/(listings\/[0-9a-f-]{36}\/[A-Za-z0-9_.-]+)$/

async function myListing(actor: Actor, listingId: string, write: boolean) {
  const host = requireHost(actor, { write })
  const listing = /^[0-9a-f-]{36}$/i.test(listingId) ? await listingsRepo.getHostListing(http, host.id, listingId) : null
  if (!listing) throw notFound('Listing')
  return { host, listing }
}

export async function listMyPhotos(actor: Actor, listingId: string): Promise<repo.PhotoRow[]> {
  const { host } = await myListing(actor, listingId, false)
  return repo.listPhotos(http, host.id, listingId)
}

/** Step 1: may this person upload this file here? Returns the token's limits. */
export async function authorizeUpload(actor: Actor, listingId: string, pathname: string) {
  const { listing } = await myListing(actor, listingId, true)
  const match = PATHNAME.exec(pathname)
  if (!match || match[1] !== listing.id) throw invalid('bad_pathname', 'That upload path isn’t allowed.')
  if (listing.status === 'archived') throw conflict('archived', 'This listing is archived.')
  if ((await repo.countPhotos(http, listing.id)) >= MAX_PHOTOS) throw conflict('too_many_photos', `A listing can have up to ${MAX_PHOTOS} photos. Delete one first.`)
  return {
    allowedContentTypes: [...PHOTO_TYPES],
    maximumSizeInBytes: MAX_PHOTO_BYTES,
    // Belt and braces: Blob adds its own random suffix to our random name,
    // so a pathname can never be guessed or overwrite another file.
    addRandomSuffix: true,
    validUntil: Date.now() + 10 * 60 * 1000,
  }
}

/** Step 3: save the uploaded blob as a photo, with its alt text. */
export async function recordPhoto(actor: Actor, listingId: string, input: { url: string; width: number; height: number; alt: string }): Promise<string> {
  const { host, listing } = await myListing(actor, listingId, true)
  const match = BLOB_URL.exec(input.url)
  if (!match || !match[1]?.startsWith(`listings/${listing.id}/`)) throw invalid('bad_url', 'That photo didn’t come from this listing’s upload.')
  try {
    return await repo.insertPhoto(http, { hostId: host.id, listingId: listing.id, url: input.url, pathname: match[1], width: input.width, height: input.height, alt: input.alt })
  } catch (error) {
    // position 12 fails the CHECK (0..11); two at once can collide on the unique position.
    if (isCheckError(error) || isUniqueError(error)) {
      await del(input.url).catch(() => {})
      throw conflict('too_many_photos', `A listing can have up to ${MAX_PHOTOS} photos.`)
    }
    throw error
  }
}

export async function updatePhotoAlt(actor: Actor, listingId: string, photoId: string, alt: string): Promise<void> {
  const { host } = await myListing(actor, listingId, true)
  if (!(await repo.updateAlt(http, host.id, photoId, alt))) throw notFound('Photo')
}

/** A new order for ALL of the listing's photos (the first becomes the cover), in one transaction. */
export async function reorderPhotos(actor: Actor, listingId: string, orderedIds: string[]): Promise<void> {
  const { host } = await myListing(actor, listingId, true)
  await withTransaction(async (tx) => {
    const current = await repo.listPhotos(tx, host.id, listingId)
    const same = current.length === orderedIds.length && new Set(orderedIds).size === orderedIds.length && current.every((p) => orderedIds.includes(p.id))
    if (!same) throw conflict('stale_photos', 'The photos changed in another tab. Reload the page and try again.')
    await repo.reorderPhotos(tx, host.id, listingId, orderedIds)
  })
}

/** Delete the row (and renumber) first; then the blob, AFTER the commit, so a failed commit never leaves a row pointing at a deleted file. */
export async function deletePhoto(actor: Actor, listingId: string, photoId: string): Promise<void> {
  const { host } = await myListing(actor, listingId, true)
  const removed = await withTransaction((tx) => repo.deletePhoto(tx, host.id, photoId))
  if (!removed) throw notFound('Photo')
  await deleteBlobs([removed.url])
}

/** Deletes uploaded files (seed files under /seed are ours and stay). Never throws: a leftover blob is untidy, not broken. */
export async function deleteBlobs(urls: string[]): Promise<void> {
  const blobs = urls.filter((url) => BLOB_URL.test(url))
  if (blobs.length === 0) return
  await del(blobs).catch((error: unknown) => console.error('[photos] blob delete failed:', error instanceof Error ? error.message : error))
}
