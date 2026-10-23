// ADMIN, AUDIT AND CRON: SQL only.
import 'server-only'

import { z } from 'zod'
import { rows, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'

export type AuditAction =
  | 'listing_submitted'
  | 'listing_approved'
  | 'listing_rejected'
  | 'listing_paused'
  | 'listing_unpaused'
  | 'listing_archived'
  | 'host_suspended'
  | 'host_unsuspended'
  | 'stay_cancelled_by_admin'

export async function insertAudit(
  db: Db,
  input: { actorId: string | null; action: AuditAction; listingId?: string | null; targetUserId?: string | null; metadata?: Record<string, unknown> },
): Promise<void> {
  await db.query(q`
    INSERT INTO audit_events (actor_id, action, listing_id, target_user_id, metadata)
    VALUES (${input.actorId}, ${input.action}, ${input.listingId ?? null}, ${input.targetUserId ?? null}, ${JSON.stringify(input.metadata ?? {})}::jsonb)`)
}

export async function listAudit(db: Db, limit: number) {
  return rows(
    db,
    z.object({ id: z.coerce.number(), action: z.string(), actorName: z.string().nullable(), listingTitle: z.string().nullable(), targetName: z.string().nullable(), metadata: z.record(z.string(), z.unknown()), createdAt: z.date() }),
    q`SELECT a.id, a.action, u.name AS "actorName", l.title AS "listingTitle", t.name AS "targetName", a.metadata, a.created_at AS "createdAt"
      FROM audit_events a
      LEFT JOIN users u ON u.id = a.actor_id
      LEFT JOIN listings l ON l.id = a.listing_id
      LEFT JOIN users t ON t.id = a.target_user_id
      ORDER BY a.created_at DESC LIMIT ${limit}`,
    'listAudit',
  )
}

export const PendingListing = z.object({
  id: z.uuid(),
  title: z.string(),
  area: z.string().nullable(),
  city: z.string().nullable(),
  hostId: z.uuid(),
  hostName: z.string(),
  hostEmail: z.string(),
  submittedAt: z.date().nullable(),
  photoCount: z.number().int(),
  coverUrl: z.string().nullable(),
  coverAlt: z.string().nullable(),
})

/** The review queue, oldest first (listings_pending_idx). */
export async function listPendingListings(db: Db) {
  return rows(
    db,
    PendingListing,
    q`SELECT l.id, l.title, l.area, l.city, l.host_id AS "hostId", h.name AS "hostName", h.email::text AS "hostEmail",
             l.submitted_at AS "submittedAt",
             (SELECT count(*)::int FROM listing_photos p WHERE p.listing_id = l.id) AS "photoCount",
             cover.blob_url AS "coverUrl", cover.alt_text AS "coverAlt"
      FROM listings l JOIN users h ON h.id = l.host_id
      LEFT JOIN listing_photos cover ON cover.listing_id = l.id AND cover.position = 0
      WHERE l.status = 'pending_review'
      ORDER BY l.submitted_at NULLS LAST`,
    'listPendingListings',
  )
}

export async function listHosts(db: Db) {
  return rows(
    db,
    z.object({ id: z.uuid(), name: z.string(), email: z.string(), isDemo: z.boolean(), suspendedAt: z.date().nullable(), listings: z.number().int(), published: z.number().int() }),
    q`SELECT u.id, u.name, u.email::text AS email, u.is_demo AS "isDemo", u.suspended_at AS "suspendedAt",
             count(l.id)::int AS listings, count(l.id) FILTER (WHERE l.status = 'published')::int AS published
      FROM users u LEFT JOIN listings l ON l.host_id = u.id
      WHERE u.role = 'host'
      GROUP BY u.id ORDER BY u.name`,
    'listHosts',
  )
}

/**
 * SUSPEND A HOST: the timestamp and the pausing of every published listing,
 * in one statement (a data-modifying CTE), so a host is never "suspended
 * but still bookable". Their existing confirmed bookings stand.
 */
export async function suspendHost(db: Db, hostId: string): Promise<{ paused: number } | null> {
  const result = await rows(
    db,
    z.object({ paused: z.number().int() }),
    q`WITH host AS (
        UPDATE users SET suspended_at = now() WHERE id = ${hostId} AND role = 'host' AND suspended_at IS NULL AND NOT is_demo RETURNING id
      ), paused AS (
        UPDATE listings SET status = 'paused', version = version + 1
        WHERE host_id IN (SELECT id FROM host) AND status IN ('published', 'pending_review')
        RETURNING id
      )
      SELECT (SELECT count(*) FROM paused)::int AS paused FROM host`,
    'suspendHost',
  )
  return result[0] ?? null
}

/** Lifting a suspension doesn't republish anything: the host unpauses each listing themselves. */
export async function unsuspendHost(db: Db, hostId: string): Promise<boolean> {
  const result = await db.query(q`UPDATE users SET suspended_at = NULL WHERE id = ${hostId} AND suspended_at IS NOT NULL RETURNING id`)
  return result.length > 0
}

export async function startCronRun(db: Db, job: 'daily' | 'lazy'): Promise<number> {
  const result = await rows(db, z.object({ id: z.coerce.number().int() }), q`INSERT INTO cron_runs (job) VALUES (${job}) RETURNING id`, 'startCronRun')
  return result[0]!.id
}

export async function finishCronRun(db: Db, id: number, ok: boolean, summary: Record<string, unknown>): Promise<void> {
  await db.query(q`UPDATE cron_runs SET finished_at = now(), ok = ${ok}, summary = ${JSON.stringify(summary)}::jsonb WHERE id = ${id}`)
}

export async function listCronRuns(db: Db, limit: number) {
  return rows(
    db,
    z.object({ id: z.coerce.number(), job: z.string(), startedAt: z.date(), finishedAt: z.date().nullable(), ok: z.boolean().nullable(), summary: z.record(z.string(), z.unknown()).nullable() }),
    q`SELECT id, job, started_at AS "startedAt", finished_at AS "finishedAt", ok, summary FROM cron_runs ORDER BY started_at DESC LIMIT ${limit}`,
    'listCronRuns',
  )
}
