// READING POSTGRESQL'S ERRORS. When the database refuses a change, the
// Neon driver throws an error carrying PostgreSQL's five-character SQLSTATE
// code and the name of the constraint that refused. The repos and services
// turn the ones we expect into ServiceErrors (lib/services/errors.ts);
// anything else is re-thrown, logged with the request id, and answered with
// a plain 500 that never contains the SQL or a stack trace.
//
// Letting the database decide, then explaining, is deliberate. "Check
// first, then write" has a gap: another request can slip in between the
// check and the write. A constraint can't be raced.
import 'server-only'

type PgError = { code?: string; constraint?: string }

function pgError(error: unknown): PgError | null {
  if (typeof error !== 'object' || error === null) return null
  const e = error as PgError
  return typeof e.code === 'string' ? e : null
}

/**
 * A delete refused because other rows still point at this one, OR an
 * insert refused because the row it points at doesn't exist FOR THIS HOST
 * (a composite (host_id, listing_id) foreign key found no match).
 *
 * Two codes: 23503 foreign_key_violation is what ON DELETE NO ACTION (the
 * default, used here) raises; ON DELETE RESTRICT raises 23001
 * restrict_violation instead (Day 18's lesson). Both are read the same way.
 */
export function isReferencedError(error: unknown): boolean {
  const code = pgError(error)?.code
  return code === '23503' || code === '23001'
}

/** 23505: a UNIQUE constraint refused a duplicate (a slug, a second review, a replayed idempotency key). */
export function isUniqueError(error: unknown, constraint?: string): boolean {
  const e = pgError(error)
  return e?.code === '23505' && (!constraint || e.constraint === constraint)
}

/**
 * 23514: a CHECK constraint refused a value. The reviews trigger in
 * db/migrations/010 raises this same code with its own constraint name
 * (reviews_require_completed_stay), so one helper reads both.
 */
export function isCheckError(error: unknown, constraint?: string): boolean {
  const e = pgError(error)
  return e?.code === '23514' && (!constraint || e.constraint === constraint)
}

/**
 * The database couldn't be REACHED at all (Neon suspended and failing to
 * wake, no network, a wrong host). These errors have no SQLSTATE: the
 * request never got as far as PostgreSQL. Pages show a friendly "we can't
 * reach Staybook" screen: "try again later", not "you did something wrong".
 */
export function isDbUnreachable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if (pgError(error)) return false
  const text = `${(error as { name?: unknown }).name ?? ''} ${(error as { message?: unknown }).message ?? ''}`
  const cause = (error as { cause?: unknown }).cause
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|WebSocket|connection terminated|Error connecting to database|DATABASE_URL is not set/i.test(text)) return true
  return cause !== undefined && cause !== error ? isDbUnreachable(cause) : false
}

/**
 * 23P01 exclusion_violation: an EXCLUDE constraint refused a row because it
 * overlaps another. The one that matters most today is stays_no_overlap:
 * two guests racing for the same nights end up with exactly one hold, and
 * the second INSERT fails with this (Day 19's lesson, on date ranges).
 */
export function isExclusionError(error: unknown, constraint?: string): boolean {
  const e = pgError(error)
  return e?.code === '23P01' && (!constraint || e.constraint === constraint)
}
