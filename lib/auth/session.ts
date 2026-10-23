// SESSIONS: the heart of "staying signed in".
//
// A session is a row in the sessions table plus a cookie in one browser.
// The cookie holds a random token; the row holds SHA-256(token). On each
// request we hash the cookie and look the hash up. No row, no session, no
// matter what the cookie says. That is the big difference from a JWT: the
// server can end a session at any moment by deleting its row (log out,
// "sign out everywhere", an admin revoking it), and it takes effect on the
// very next request.
import 'server-only'

import { cookies } from 'next/headers'
import { z } from 'zod'
import { sql, sqlTransaction } from '@/lib/db'
import { parseRows, SessionSchema, UserSchema, type Session, type User } from '@/lib/rows'
import { SESSION_COOKIE, SESSION_LIFETIME_SECONDS, SESSION_RENEW_WITHIN_SECONDS, sessionCookieOptions } from './cookie'
import { eventQuery, type NewAuthEvent, type TxQuery } from './events'
import type { RequestInfo } from './request'
import { generateToken, hashToken } from './tokens'

export type SessionWithUser = { session: Session; user: User }

/** "Last active" is written at most this often, so most page views don't write to the database. */
const LAST_SEEN_RESOLUTION = '5 minutes'

// ---------------------------------------------------------------------------
// The cookie
// ---------------------------------------------------------------------------

/** Only works where cookies can be written: Server Actions and route handlers. */
async function setSessionCookie(token: string) {
  ;(await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions())
}

/**
 * Deletes the cookie by overwriting it with an empty value that has already
 * expired. Done with set() rather than delete() so the Secure and Path flags
 * are repeated: browsers ignore an attempt to remove a "__Host-" cookie
 * unless the removal carries the same flags.
 */
export async function clearSessionCookie() {
  ;(await cookies()).set(SESSION_COOKIE, '', sessionCookieOptions(0))
}

async function readSessionToken(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  // A real token is exactly 43 base64url characters. Anything else is junk
  // (or an attack); skip the database entirely.
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null
}

// ---------------------------------------------------------------------------
// Starting a session
// ---------------------------------------------------------------------------

function insertSession(tx: TxQuery, id: string, userId: string, request: RequestInfo) {
  return tx`
    INSERT INTO sessions (id, user_id, expires_at, user_agent, ip, location)
    VALUES (${id}, ${userId}, now() + make_interval(secs => ${SESSION_LIFETIME_SECONDS}),
            ${request.userAgent}, ${request.ip}, ${request.location})`
}

/**
 * Signs a user in on this browser: makes a NEW token, stores its hash, and
 * sets the cookie. Must run in a Server Action or route handler.
 *
 * SESSION ROTATION: if this browser already had a session cookie, that old
 * session is deleted and replaced, never reused. This defeats "session
 * fixation": an attacker who managed to plant a cookie value of their
 * choosing in your browser before you signed in would otherwise share your
 * signed-in session.
 *
 * In the same transaction: the user's expired sessions are cleaned up, and
 * an audit event (if given) is recorded, so they all happen or none do.
 */
export async function startSession(userId: string, request: RequestInfo, event?: NewAuthEvent, extra: (tx: TxQuery) => ReturnType<TxQuery>[] = () => []): Promise<void> {
  const oldToken = await readSessionToken()
  const token = generateToken()
  const id = hashToken(token)

  await sqlTransaction((tx) => [
    ...(oldToken ? [tx`DELETE FROM sessions WHERE id = ${hashToken(oldToken)}`] : []),
    tx`DELETE FROM sessions WHERE user_id = ${userId} AND expires_at <= now()`,
    insertSession(tx, id, userId, request),
    ...(event ? [eventQuery(tx, event)] : []),
    ...extra(tx),
  ])
  await setSessionCookie(token)
}

// ---------------------------------------------------------------------------
// Reading the session on each request
// ---------------------------------------------------------------------------

const SessionUserRowSchema = SessionSchema.extend({
  email: z.string(),
  name: z.string(),
  role: UserSchema.shape.role,
  emailVerifiedAt: z.date().nullable(),
  isDemo: z.boolean(),
  suspendedAt: z.date().nullable(),
  phone: z.string().nullable(),
  userCreatedAt: z.date(),
})

/**
 * Returns the session and user for this request's cookie, or null.
 *
 * ONE SQL statement does three jobs, so it costs one round trip to the
 * database (about 250 ms from Nigeria to Frankfurt; see Day 16):
 *
 * 1. `expired`: if the cookie names a session that has expired, delete the
 *    row now (expired sessions are rejected AND cleaned up).
 * 2. `touched`: SLIDING RENEWAL. A session used in its last 15 days is
 *    pushed back out to 30 days from now, so someone who visits regularly
 *    is never signed out, while a forgotten session still dies. It also
 *    bumps last_seen_at, but only if the old value is over 5 minutes old,
 *    so most requests write nothing. This runs at most once per request,
 *    because verifySession() (lib/auth/dal.ts) is memoised per request.
 * 3. The SELECT joins the user, so the caller gets both in one go.
 * *
 * All three see the database as it was when the statement started, so the
 * SELECT reads the OLD expires_at; COALESCE picks the new one from
 * `touched` when there is one.
 *
 * Pages can't write cookies while rendering, so the cookie's own Max-Age is
 * refreshed separately by proxy.ts on each page request.
 */
export async function readSession(): Promise<SessionWithUser | null> {
  const token = await readSessionToken()
  if (!token) return null
  const id = hashToken(token)

  const rows = await sql`
    WITH expired AS (
      DELETE FROM sessions WHERE id = ${id} AND expires_at <= now()
    ),
    touched AS (
      UPDATE sessions SET
        last_seen_at = now(),
        expires_at = CASE
          WHEN expires_at < now() + make_interval(secs => ${SESSION_RENEW_WITHIN_SECONDS})
          THEN now() + make_interval(secs => ${SESSION_LIFETIME_SECONDS})
          ELSE expires_at
        END
      WHERE id = ${id} AND expires_at > now()
        AND (last_seen_at < now() - ${LAST_SEEN_RESOLUTION}::interval
             OR expires_at < now() + make_interval(secs => ${SESSION_RENEW_WITHIN_SECONDS}))
      RETURNING expires_at, last_seen_at
    )
    SELECT s.id, s.user_id AS "userId", s.created_at AS "createdAt",
           COALESCE(t.expires_at, s.expires_at) AS "expiresAt",
           COALESCE(t.last_seen_at, s.last_seen_at) AS "lastSeenAt",
           s.user_agent AS "userAgent", s.ip, s.location,
           u.email::text AS email, u.name, u.role, u.email_verified_at AS "emailVerifiedAt",
           u.is_demo AS "isDemo", u.suspended_at AS "suspendedAt", u.phone, u.created_at AS "userCreatedAt"
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN touched t ON true
    WHERE s.id = ${id} AND s.expires_at > now()`

  const row = parseRows(SessionUserRowSchema, rows, 'readSession')[0]
  if (!row) return null
  const { email, name, role, emailVerifiedAt, isDemo, suspendedAt, phone, userCreatedAt, ...session } = row
  return {
    session,
    user: { id: session.userId, email, name, role, emailVerifiedAt, isDemo, suspendedAt, phone, createdAt: userCreatedAt },
  }
}

// ---------------------------------------------------------------------------
// Ending sessions
// ---------------------------------------------------------------------------

/** Log out: delete this browser's session row AND its cookie. */
export async function endCurrentSession(request: RequestInfo): Promise<void> {
  const token = await readSessionToken()
  if (token) {
    const id = hashToken(token)
    // The data-modifying CTE deletes the row and logs the event in one
    // statement; if the session was already gone, nothing is logged.
    await sql`
      WITH gone AS (DELETE FROM sessions WHERE id = ${id} RETURNING user_id)
      INSERT INTO auth_events (user_id, type, ip, user_agent)
      SELECT user_id, 'logged_out', ${request.ip}, ${request.userAgent} FROM gone`
  }
  await clearSessionCookie()
}

/**
 * Revokes ONE session. The user_id condition means a user can only revoke
 * their own sessions, even if they send someone else's session id.
 * Returns whether a session was revoked.
 */
export async function revokeSession(userId: string, sessionId: string, request: RequestInfo): Promise<boolean> {
  const rows = await sql`
    WITH gone AS (DELETE FROM sessions WHERE id = ${sessionId} AND user_id = ${userId} RETURNING user_id, user_agent)
    INSERT INTO auth_events (user_id, type, ip, user_agent, metadata)
    SELECT user_id, 'session_revoked', ${request.ip}, ${request.userAgent},
           jsonb_build_object('scope', 'one', 'device', gone.user_agent)
    FROM gone
    RETURNING id`
  return rows.length > 0
}

/** Deletes every session of a user EXCEPT the given one (sign out everywhere else). */
export function deleteOtherSessionsQuery(tx: TxQuery, userId: string, keepSessionId: string | null) {
  return keepSessionId
    ? tx`DELETE FROM sessions WHERE user_id = ${userId} AND id <> ${keepSessionId}`
    : tx`DELETE FROM sessions WHERE user_id = ${userId}`
}

/**
 * "Sign out everywhere else", or (with keepSessionId null) every session,
 * e.g. an admin locking someone out. Returns how many sessions ended.
 */
export async function revokeOtherSessions(userId: string, keepSessionId: string | null, request: RequestInfo, actorId: string | null = null): Promise<number> {
  const rows = await sql`
    WITH gone AS (
      DELETE FROM sessions
      WHERE user_id = ${userId} AND (${keepSessionId}::text IS NULL OR id <> ${keepSessionId})
      RETURNING 1
    )
    INSERT INTO auth_events (user_id, actor_id, type, ip, user_agent, metadata)
    SELECT ${userId}, ${actorId}, 'session_revoked', ${request.ip}, ${request.userAgent},
           jsonb_build_object('scope', ${keepSessionId ? 'others' : 'all'}::text, 'count', count(*))
    FROM gone
    HAVING count(*) > 0
    RETURNING (metadata->>'count')::int AS count`
  return Number(rows[0]?.count ?? 0)
}

/** Every unexpired session of a user, most recently active first (/account/sessions). */
export async function listSessions(userId: string): Promise<Session[]> {
  const rows = await sql`
    SELECT id, user_id AS "userId", created_at AS "createdAt", expires_at AS "expiresAt",
           last_seen_at AS "lastSeenAt", user_agent AS "userAgent", ip, location
    FROM sessions
    WHERE user_id = ${userId} AND expires_at > now()
    ORDER BY last_seen_at DESC`
  return parseRows(SessionSchema, rows, 'listSessions')
}
