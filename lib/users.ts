// USER QUERIES. Every read and write of the users table goes through here.
//
// Rules (the same as Day 16's lib/notes.ts):
// - Every value reaches SQL as a PARAMETER (${value} in the sql`` tagged
//   template). No string concatenation, ever.
// - Every row coming back is checked with Zod (lib/rows.ts).
// - password_hash only leaves this file through the *WithHash functions,
//   which only the login and password checks call. Pages never see it.
// - A change and the audit event describing it are written in ONE
//   statement or transaction, so neither can happen without the other.
import 'server-only'

import { sql, sqlTransaction } from '@/lib/db'
import { parseRows, UserSchema, UserWithHashSchema, type User, type UserWithHash } from '@/lib/rows'
import { eventQuery } from '@/lib/auth/events'
import type { RequestInfo } from '@/lib/auth/request'
import { deleteOtherSessionsQuery } from '@/lib/auth/session'
import { hashToken } from '@/lib/auth/tokens'

const userColumns = () => sql`
  u.id, u.email::text AS email, u.name, u.role,
  u.email_verified_at AS "emailVerifiedAt", u.is_demo AS "isDemo", u.suspended_at AS "suspendedAt",
  u.phone, u.created_at AS "createdAt"`

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** For login: the user AND their hash. email is citext, so the match ignores case. */
export async function findUserWithHashByEmail(email: string): Promise<UserWithHash | null> {
  const rows = await sql`SELECT ${userColumns()}, u.password_hash AS "passwordHash" FROM users u WHERE u.email = ${email}`
  return parseRows(UserWithHashSchema, rows, 'findUserWithHashByEmail')[0] ?? null
}

/** For "enter your current password" checks on a signed-in account. */
export async function findUserWithHashById(id: string): Promise<UserWithHash | null> {
  const rows = await sql`SELECT ${userColumns()}, u.password_hash AS "passwordHash" FROM users u WHERE u.id = ${id}`
  return parseRows(UserWithHashSchema, rows, 'findUserWithHashById')[0] ?? null
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await sql`SELECT ${userColumns()} FROM users u WHERE u.email = ${email}`
  return parseRows(UserSchema, rows, 'findUserByEmail')[0] ?? null
}

// ---------------------------------------------------------------------------
// Signing up and verifying
// ---------------------------------------------------------------------------

/**
 * SIGN-UP (open, as on Day 17): creates a 'guest' account and logs
 * "signed_up", in ONE statement. Returns the new id, or null if the email
 * is already taken.
 *
 * The role is written here as the literal 'guest', never read from the
 * form, so nobody can sign themselves up as a host or an admin. (Hosts opt
 * in at /host/start; admins are made by npm run db:seed.)
 *
 * ON CONFLICT DO NOTHING makes the UNIQUE index the judge: two sign-ups for
 * the same address at the same moment can't both succeed, and the loser
 * gets null rather than an error. (Checking "does it exist?" first and then
 * inserting would leave a gap between the two where both could pass.)
 */
export async function createUser(input: { name: string; email: string; passwordHash: string }, request: RequestInfo): Promise<string | null> {
  const rows = await sql`
    WITH created AS (
      INSERT INTO users (name, email, password_hash, role)
      VALUES (${input.name}, ${input.email}, ${input.passwordHash}, 'guest')
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    )
    INSERT INTO auth_events (user_id, type, ip, user_agent)
    SELECT id, 'signed_up', ${request.ip}, ${request.userAgent} FROM created
    RETURNING user_id AS "userId"`
  const id = rows[0]?.userId
  return typeof id === 'string' ? id : null
}

/**
 * Uses a verification token and marks the email verified, in one statement.
 *
 * `consumed` is the SINGLE-USE check: the UPDATE only matches a token that
 * is unused and unexpired, and sets used_at in the same step. If two clicks
 * arrive together, PostgreSQL locks the row for the first; the second then
 * sees used_at already set and matches nothing.
 *
 * Returns the user's id, or null if the token was invalid, used or expired.
 */
export async function verifyEmailWithToken(token: string, request: RequestInfo): Promise<string | null> {
  const rows = await sql`
    WITH consumed AS (
      UPDATE email_tokens SET used_at = now()
      WHERE token_hash = ${hashToken(token)} AND purpose = 'verify_email'
        AND used_at IS NULL AND expires_at > now()
      RETURNING user_id
    ),
    verified AS (
      UPDATE users SET email_verified_at = COALESCE(email_verified_at, now())
      WHERE id = (SELECT user_id FROM consumed)
      RETURNING id
    )
    INSERT INTO auth_events (user_id, type, ip, user_agent)
    SELECT id, 'email_verified', ${request.ip}, ${request.userAgent} FROM verified
    RETURNING user_id AS "userId"`
  const id = rows[0]?.userId
  return typeof id === 'string' ? id : null
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

/**
 * Resets a password with an email link, in one statement:
 * use the token (single use, as above), store the new hash, mark the email
 * verified (opening the link proved they own the inbox), sign out EVERY
 * session (whoever knew the old password is now locked out), and log it.
 *
 * Returns the user's id, or null if the link was invalid, used or expired.
 */
export async function resetPasswordWithToken(token: string, passwordHash: string, request: RequestInfo): Promise<string | null> {
  const rows = await sql`
    WITH consumed AS (
      UPDATE email_tokens SET used_at = now()
      WHERE token_hash = ${hashToken(token)} AND purpose = 'reset_password'
        AND used_at IS NULL AND expires_at > now()
      RETURNING user_id
    ),
    updated AS (
      -- Demo accounts have no password, and a reset link can't give them one.
      UPDATE users SET password_hash = ${passwordHash},
                       email_verified_at = COALESCE(email_verified_at, now())
      WHERE id = (SELECT user_id FROM consumed) AND NOT is_demo
      RETURNING id
    ),
    signed_out AS (
      DELETE FROM sessions WHERE user_id = (SELECT id FROM updated) RETURNING 1
    )
    INSERT INTO auth_events (user_id, type, ip, user_agent, metadata)
    SELECT id, 'password_reset', ${request.ip}, ${request.userAgent},
           jsonb_build_object('sessionsEnded', (SELECT count(*) FROM signed_out))
    FROM updated
    RETURNING user_id AS "userId"`
  const id = rows[0]?.userId
  return typeof id === 'string' ? id : null
}

/**
 * Changes the password of a signed-in user and signs out every OTHER
 * session, keeping this browser signed in. If someone else had the old
 * password and was signed in somewhere, they're out now.
 */
export async function changePassword(userId: string, passwordHash: string, keepSessionId: string, request: RequestInfo): Promise<void> {
  await sqlTransaction((tx) => [
    tx`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId} AND NOT is_demo`,
    deleteOtherSessionsQuery(tx, userId, keepSessionId),
    // Any reset link still sitting in an inbox stops working too.
    tx`UPDATE email_tokens SET used_at = now()
       WHERE user_id = ${userId} AND purpose = 'reset_password' AND used_at IS NULL`,
    eventQuery(tx, { type: 'password_changed', userId, request }),
  ])
}

/** Upgrades an old-settings hash after a successful login (see needsRehash). No event: nothing changed for the user. */
export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId}`
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** The name, plus the audit event, in one transaction. */
export async function updateProfile(userId: string, input: { name: string }, request: RequestInfo): Promise<void> {
  await sqlTransaction((tx) => [
    tx`UPDATE users SET name = ${input.name} WHERE id = ${userId}`,
    eventQuery(tx, { type: 'profile_updated', userId, request }),
  ])
}
