// CURSOR PAGINATION ("keyset pagination").
//
// A list answers with up to `limit` items and a `next_cursor`. To get the
// next page, send that cursor back. The cursor is the SORT KEY OF THE LAST
// ITEM you received (for "newest first": its created_at and id), and the
// next query asks for rows strictly AFTER it:
//
//   WHERE (created_at, id) < ($last_created_at, $last_id)
//   ORDER BY created_at DESC, id DESC LIMIT 25
//
// WHY NOT ?page=3 (LIMIT 25 OFFSET 50)?
//   1. Speed: OFFSET 5000 makes PostgreSQL produce and THROW AWAY 5,000
//      rows before returning 25. Page 200 is 200 times the work of page 1.
//      A cursor is an index seek straight to the right spot: page 200
//      costs the same as page 1.
//   2. Correctness on a busy table: while a client walks through orders, new
//      orders arrive at the top. With OFFSET, each new row pushes everything
//      down one place, so the client sees an item TWICE (it slid onto the
//      next page) or, when rows are removed, SKIPS one. A cursor says
//      "after THIS row", which stays put however many rows are added above.
//
// The id is always the last sort key: created_at (or a price) can tie, and
// the id breaks the tie, so the order is total and no row falls between
// two pages.
//
// The cursor is OPAQUE (base64url of a small JSON object): clients must not
// build or edit it, which leaves us free to change what's inside. It also
// records the sort and a fingerprint of the filters, so a cursor from one
// query can't be replayed against another (that answers 400).
import 'server-only'

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { badRequest } from '@/lib/services/errors'

export const DEFAULT_LIMIT = 24
export const MAX_LIMIT = 100

export type CursorKey = string | number

const CursorSchema = z.object({
  s: z.string().max(40), // the sort it belongs to
  f: z.string().length(16), // fingerprint of the filters
  k: z.array(z.union([z.string().max(64), z.number()])).min(1).max(3), // the last row's sort key, id last
})

/** A short, stable fingerprint of the filters (key order doesn't matter). */
export function fingerprint(filters: Record<string, unknown>): string {
  const canonical = JSON.stringify(Object.keys(filters).sort().map((key) => [key, filters[key] ?? null]))
  return createHash('sha256').update(canonical).digest('base64url').slice(0, 16)
}

export function encodeCursor(sort: string, filters: Record<string, unknown>, key: CursorKey[]): string {
  return Buffer.from(JSON.stringify({ s: sort, f: fingerprint(filters), k: key }), 'utf8').toString('base64url')
}

/** Decodes a cursor and checks it belongs to this sort and these filters. Throws 400 if not. */
export function decodeCursor(raw: string, sort: string, filters: Record<string, unknown>): CursorKey[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  } catch {
    throw badRequest('invalid_cursor', 'That cursor isn’t valid. Use the next_cursor value from the previous page, unchanged.')
  }
  const result = CursorSchema.safeParse(parsed)
  if (!result.success) {
    throw badRequest('invalid_cursor', 'That cursor isn’t valid. Use the next_cursor value from the previous page, unchanged.')
  }
  if (result.data.s !== sort || result.data.f !== fingerprint(filters)) {
    throw badRequest('cursor_mismatch', 'That cursor came from a list with a different sort or filters. Start again without a cursor.')
  }
  return result.data.k
}

export type Page<T> = { items: T[]; nextCursor: string | null }

/**
 * The repos fetch limit + 1 rows: if the extra row came back there IS a next
 * page, and the cursor is built from the last row actually returned. No
 * separate COUNT(*) query is needed.
 */
export function toPage<T>(rows: T[], limit: number, cursorFor: (last: T) => string): Page<T> {
  const items = rows.slice(0, limit)
  const last = items[items.length - 1]
  return { items, nextCursor: rows.length > limit && last ? cursorFor(last) : null }
}
