// RATE LIMITING: "at most N attempts per window", counted in PostgreSQL.
//
// Why rate limiting and not ACCOUNT LOCKOUT ("3 wrong passwords and the
// account is locked until you call support")? Lockout hands every stranger
// a button that locks YOU out: they just type your email with wrong
// passwords. A rate limit only slows guessing down: after 5 tries the next
// one waits up to 15 minutes, which turns millions of guesses into a few
// hundred a day, while you can still get in once the window passes (or
// right away with a password reset link).
//
// We count per IP address AND per email:
// - per IP stops one machine guessing passwords for many accounts;
// - per email stops many machines (a botnet) guessing one account.
//
// Why Postgres and not memory: see db/migrations/005_rate_limits.sql.
import 'server-only'

import { createHash } from 'node:crypto'
import { sql } from '@/lib/db'

// Staybook adds three: the demo buttons, Reserve, and photo upload tokens.
export type RateLimitAction = 'login' | 'signup' | 'forgot' | 'resend' | 'demo' | 'reserve' | 'upload'

/** How long each window lasts, and how many attempts fit in it per IP / per email (or user). */
export const RATE_LIMITS: Record<RateLimitAction, { windowSeconds: number; perIp: number; perAccount: number }> = {
  login: { windowSeconds: 15 * 60, perIp: 20, perAccount: 5 },
  forgot: { windowSeconds: 60 * 60, perIp: 10, perAccount: 3 },
  signup: { windowSeconds: 60 * 60, perIp: 5, perAccount: 3 },
  resend: { windowSeconds: 60 * 60, perIp: 10, perAccount: 3 },
  // The demo buttons: every "Try as a guest" click creates a user and two
  // stays, so one IP gets 10 an hour.
  demo: { windowSeconds: 60 * 60, perIp: 10, perAccount: 1000 },
  // Reserve ("account" = the user id): each one holds nights for 15 minutes,
  // so a script can't hold every December weekend in Lagos.
  reserve: { windowSeconds: 60 * 60, perIp: 60, perAccount: 20 },
  // Upload tokens ("account" = the user id): 12 photos a listing, a few listings.
  upload: { windowSeconds: 60 * 60, perIp: 200, perAccount: 120 },
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number; message: string }

/**
 * The email part of a key is hashed, so the table doesn't become a list of
 * every address anyone typed. Lower-cased first, matching citext.
 */
function accountPart(account: string): string {
  return createHash('sha256').update(account.trim().toLowerCase()).digest('hex').slice(0, 32)
}

/** The key that counts attempts against one account (an email, or a user id). */
export function accountKey(action: RateLimitAction, account: string): string {
  return `${action}:account:${accountPart(account)}`
}

function keysFor(action: RateLimitAction, ip: string, account: string | null) {
  const { perIp, perAccount } = RATE_LIMITS[action]
  const keys = [{ key: `${action}:ip:${ip}`, limit: perIp }]
  if (account) keys.push({ key: accountKey(action, account), limit: perAccount })
  return keys
}

/**
 * Counts one attempt against every key and says whether it's allowed.
 *
 * ONE ATOMIC STATEMENT for all keys (one database round trip):
 * - a key seen for the first time is INSERTed with count 1;
 * - an existing key whose window has ended starts a new window at 1;
 * - otherwise its count goes up by 1.
 * ON CONFLICT ... DO UPDATE locks each row while it changes it, so two
 * requests at the same moment are counted one after the other, never both
 * as "the 5th". RETURNING hands back the new counts.
 *
 * The attempt is counted BEFORE the password is checked, so a blocked
 * attempt never even reaches argon2.
 */
export async function checkRateLimit(action: RateLimitAction, ip: string, account: string | null): Promise<RateLimitResult> {
  const { windowSeconds } = RATE_LIMITS[action]
  const keys = keysFor(action, ip, account)

  const rows = await sql`
    INSERT INTO rate_limits AS r (key)
    SELECT unnest(${keys.map((k) => k.key)}::text[])
    ON CONFLICT (key) DO UPDATE SET
      window_start = CASE WHEN r.window_start <= now() - make_interval(secs => ${windowSeconds})
                          THEN now() ELSE r.window_start END,
      count        = CASE WHEN r.window_start <= now() - make_interval(secs => ${windowSeconds})
                          THEN 1 ELSE r.count + 1 END
    RETURNING key, count,
      ceil(extract(epoch FROM r.window_start + make_interval(secs => ${windowSeconds}) - now()))::int AS "retryAfter"`

  let retryAfterSeconds = 0
  for (const row of rows) {
    const rule = keys.find((k) => k.key === row.key)
    if (rule && Number(row.count) > rule.limit) {
      retryAfterSeconds = Math.max(retryAfterSeconds, Number(row.retryAfter), 1)
    }
  }
  if (retryAfterSeconds === 0) return { ok: true }
  return { ok: false, retryAfterSeconds, message: tryAgainMessage(retryAfterSeconds) }
}

/**
 * After a SUCCESSFUL password check, forget that account's failed
 * attempts, so the real owner never locks themselves out by signing in or
 * confirming their password a few times in a row. (The per-IP count stays.)
 */
export async function clearAccountRateLimit(action: RateLimitAction, account: string): Promise<void> {
  await sql`DELETE FROM rate_limits WHERE key = ${accountKey(action, account)}`
}

export function tryAgainMessage(seconds: number): string {
  const minutes = Math.ceil(seconds / 60)
  return `Too many attempts. Please try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
}
