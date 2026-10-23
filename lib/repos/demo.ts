// DEMO ACCOUNTS: SQL only (the rules are in lib/services/demo.ts).
import 'server-only'

import { z } from 'zod'
import { one, rows, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'

/** A fresh demo guest: verified, NO password (migration 006 allows that only when is_demo), flagged is_demo. */
export async function insertDemoGuest(db: Db, input: { email: string; name: string }): Promise<string> {
  const result = await rows(
    db,
    z.object({ id: z.uuid() }),
    q`INSERT INTO users (email, name, role, password_hash, email_verified_at, is_demo)
      VALUES (${input.email}, ${input.name}, 'guest', NULL, now(), true)
      RETURNING id`,
    'insertDemoGuest',
  )
  return result[0]!.id
}

/** The shared demo host made by the seed. */
export async function findDemoHost(db: Db, email: string): Promise<string | null> {
  const row = await one(db, z.object({ id: z.uuid() }), q`SELECT id FROM users WHERE email = ${email} AND is_demo AND role = 'host'`, 'findDemoHost')
  return row?.id ?? null
}

/** Demo GUESTS older than the cut-off (partial index users_demo_created_idx). The shared host is never in this list. */
export async function listExpiredDemoGuests(db: Db, olderThanHours: number, limit: number): Promise<string[]> {
  const result = await rows(
    db,
    z.object({ id: z.uuid() }),
    q`SELECT id FROM users
      WHERE is_demo AND role = 'guest' AND created_at < now() - make_interval(hours => ${olderThanHours})
      ORDER BY created_at LIMIT ${limit}`,
    'listExpiredDemoGuests',
  )
  return result.map((r) => r.id)
}

/**
 * Deletes one demo guest and everything they made, children first. Their
 * stays are ON DELETE RESTRICT on purpose (a REAL guest's history must never
 * vanish with their account), so the cleanup removes them explicitly:
 * reviews, refunds, payments, then the stays, then the user (sessions and
 * the wishlist CASCADE). Run inside one transaction by the service.
 */
export async function deleteDemoGuest(db: Db, userId: string): Promise<boolean> {
  // Guard first, and lock the row: whatever id this is handed, a REAL
  // account's stays are never touched.
  const demo = await db.query(q`SELECT id FROM users WHERE id = ${userId} AND is_demo AND role = 'guest' FOR UPDATE`)
  if (demo.length === 0) return false
  await db.query(q`DELETE FROM reviews WHERE guest_id = ${userId}`)
  await db.query(q`DELETE FROM refunds WHERE stay_id IN (SELECT id FROM stays WHERE guest_id = ${userId})`)
  await db.query(q`DELETE FROM payments WHERE stay_id IN (SELECT id FROM stays WHERE guest_id = ${userId})`)
  await db.query(q`DELETE FROM stays WHERE guest_id = ${userId}`)
  const result = await db.query(q`DELETE FROM users WHERE id = ${userId} AND is_demo AND role = 'guest' RETURNING id`)
  return result.length > 0
}
