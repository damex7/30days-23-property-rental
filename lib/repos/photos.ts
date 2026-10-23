// LISTING PHOTOS: SQL only. Every query names host_id, and the composite
// foreign key (host_id, listing_id) → listings refuses a photo for someone
// else's listing even if a query forgot.
import 'server-only'

import { z } from 'zod'
import { rows, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'

export const PhotoRow = z.object({
  id: z.uuid(),
  url: z.string(),
  pathname: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  alt: z.string(),
  position: z.number().int(),
})
export type PhotoRow = z.infer<typeof PhotoRow>

export async function listPhotos(db: Db, hostId: string, listingId: string): Promise<PhotoRow[]> {
  return rows(
    db,
    PhotoRow,
    q`SELECT id, blob_url AS url, blob_pathname AS pathname, width, height, alt_text AS alt, position
      FROM listing_photos WHERE listing_id = ${listingId} AND host_id = ${hostId} ORDER BY position`,
    'listPhotos',
  )
}

/**
 * Adds a photo at the next free position. Position must be 0..11 (CHECK)
 * and unique per listing, so the 13th photo is refused by the DATABASE
 * (23514) whatever the upload route let through.
 */
export async function insertPhoto(db: Db, input: { hostId: string; listingId: string; url: string; pathname: string; width: number; height: number; alt: string }): Promise<string> {
  const result = await rows(
    db,
    z.object({ id: z.uuid() }),
    q`INSERT INTO listing_photos (listing_id, host_id, blob_url, blob_pathname, width, height, alt_text, position)
      SELECT ${input.listingId}, ${input.hostId}, ${input.url}, ${input.pathname}, ${input.width}, ${input.height}, ${input.alt},
             coalesce(max(position) + 1, 0)
      FROM listing_photos WHERE listing_id = ${input.listingId}
      RETURNING id`,
    'insertPhoto',
  )
  return result[0]!.id
}

/**
 * REORDER IN ONE STATEMENT: the ids in their new order become positions
 * 0, 1, 2... (WITH ORDINALITY numbers them). Halfway through the UPDATE two
 * rows briefly share a position, which is why the unique constraint is
 * DEFERRABLE (db/migrations/007): it's checked when the statement ends.
 * Returns how many rows moved (the service checks it's all of them).
 */
export async function reorderPhotos(db: Db, hostId: string, listingId: string, orderedIds: string[]): Promise<number> {
  const result = await db.query(q`
    UPDATE listing_photos p SET position = o.ord - 1
    FROM unnest(${orderedIds}::uuid[]) WITH ORDINALITY AS o(id, ord)
    WHERE p.id = o.id AND p.listing_id = ${listingId} AND p.host_id = ${hostId}
    RETURNING p.id`)
  return result.length
}

export async function updateAlt(db: Db, hostId: string, photoId: string, alt: string): Promise<boolean> {
  const result = await db.query(q`UPDATE listing_photos SET alt_text = ${alt} WHERE id = ${photoId} AND host_id = ${hostId} RETURNING id`)
  return result.length > 0
}

/** Deletes one photo and closes the gap in the numbering, in the same transaction. Returns the deleted row. */
export async function deletePhoto(db: Db, hostId: string, photoId: string): Promise<{ url: string; listingId: string } | null> {
  const gone = await rows(
    db,
    z.object({ url: z.string(), listingId: z.uuid() }),
    q`DELETE FROM listing_photos WHERE id = ${photoId} AND host_id = ${hostId} RETURNING blob_url AS url, listing_id AS "listingId"`,
    'deletePhoto',
  )
  const row = gone[0]
  if (!row) return null
  await db.query(q`
    UPDATE listing_photos p SET position = n.rn - 1
    FROM (SELECT id, row_number() OVER (ORDER BY position) AS rn FROM listing_photos WHERE listing_id = ${row.listingId}) n
    WHERE p.id = n.id AND p.position <> n.rn - 1`)
  return row
}

export async function countPhotos(db: Db, listingId: string): Promise<number> {
  const result = await rows(db, z.object({ n: z.number().int() }), q`SELECT count(*)::int AS n FROM listing_photos WHERE listing_id = ${listingId}`, 'countPhotos')
  return result[0]?.n ?? 0
}
