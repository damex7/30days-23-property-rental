// THE WISHLIST: SQL only.
import 'server-only'

import { z } from 'zod'
import { rows, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { PublicCard, publicCardColumns, publicCardFrom } from './listings'

/** Saves or un-saves; the primary key (user_id, listing_id) makes a double tap harmless. Published listings only. */
export async function setSaved(db: Db, userId: string, listingId: string, saved: boolean): Promise<boolean> {
  if (saved) {
    const result = await db.query(q`
      INSERT INTO saved_listings (user_id, listing_id)
      SELECT ${userId}, id FROM listings WHERE id = ${listingId} AND status = 'published'
      ON CONFLICT (user_id, listing_id) DO NOTHING
      RETURNING listing_id`)
    if (result.length > 0) return true
    const exists = await db.query(q`SELECT 1 FROM saved_listings WHERE user_id = ${userId} AND listing_id = ${listingId}`)
    return exists.length > 0
  }
  await db.query(q`DELETE FROM saved_listings WHERE user_id = ${userId} AND listing_id = ${listingId}`)
  return true
}

/** My saved listings that are still published, newest first (the primary key serves user_id). */
export async function listSaved(db: Db, userId: string): Promise<PublicCard[]> {
  return rows(
    db,
    PublicCard,
    q`SELECT ${publicCardColumns} ${publicCardFrom}
      JOIN saved_listings sl ON sl.listing_id = l.id AND sl.user_id = ${userId}
      WHERE l.status = 'published'
      ORDER BY sl.created_at DESC`,
    'listSaved',
  )
}

export async function isSaved(db: Db, userId: string, listingId: string): Promise<boolean> {
  const result = await rows(db, z.object({ saved: z.boolean() }), q`SELECT EXISTS (SELECT 1 FROM saved_listings WHERE user_id = ${userId} AND listing_id = ${listingId}) AS saved`, 'isSaved')
  return result[0]?.saved ?? false
}
