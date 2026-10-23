// RANDOM TOKENS: the secret in the session cookie and in email links.
import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { sql, sqlTransaction } from '@/lib/db'

/**
 * 32 bytes (256 bits) from the operating system's cryptographically secure
 * random generator, as base64url (letters, digits, - and _): 43 characters,
 * safe in a cookie and in a URL without escaping.
 *
 * Why 256 bits: an attacker guessing tokens would need about 2^255 tries to
 * hit one. Even trying a billion per second, the sun burns out first.
 * Never Math.random(): its output can be predicted from earlier values.
 */
export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * SHA-256 of a token, as 64 hex characters. Only this goes into the
 * database (sessions.id, email_tokens.token_hash). See
 * db/migrations/002_sessions.sql for why we store a hash.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type EmailTokenPurpose = 'verify_email' | 'reset_password'

/** How long each kind of link works. Short, because an old email is a standing key. */
const LIFETIME: Record<EmailTokenPurpose, string> = {
  verify_email: '24 hours',
  reset_password: '30 minutes',
}

/**
 * Makes a new one-time token and returns the RAW token for the email link.
 * In the same transaction it cancels any older unused token of the same
 * purpose, so only the newest link works.
 */
export async function createEmailToken(userId: string, purpose: EmailTokenPurpose): Promise<string> {
  const token = generateToken()
  await sqlTransaction((tx) => [
    tx`UPDATE email_tokens SET used_at = now()
       WHERE user_id = ${userId} AND purpose = ${purpose} AND used_at IS NULL`,
    tx`INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at)
       VALUES (${hashToken(token)}, ${userId}, ${purpose}, now() + ${LIFETIME[purpose]}::interval)`,
  ])
  return token
}

export type TokenCheck =
  | { status: 'valid'; userId: string; email: string; name: string }
  | { status: 'used' | 'expired' | 'invalid' }

/**
 * Looks a token up WITHOUT using it, so a page can say "this link has
 * expired" before showing a form. The real, single-use check happens again
 * when the form is submitted (the token could be used in between).
 */
export async function checkEmailToken(token: string, purpose: EmailTokenPurpose): Promise<TokenCheck> {
  const rows = await sql`
    SELECT t.user_id, t.used_at, t.expires_at <= now() AS expired, u.email, u.name
    FROM email_tokens t JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ${hashToken(token)} AND t.purpose = ${purpose}`
  const row = rows[0]
  if (!row) return { status: 'invalid' }
  if (row.used_at) return { status: 'used' }
  if (row.expired) return { status: 'expired' }
  return { status: 'valid', userId: String(row.user_id), email: String(row.email), name: String(row.name) }
}
