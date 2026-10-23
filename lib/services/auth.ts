// SIGNING IN AND SIGNING UP, as services. The pieces
// are Day 17's (argon2id, rate limits, session rotation, no account
// enumeration); this file only puts them in one order.
import 'server-only'

import { after } from 'next/server'
import { existingAccountMessage, sendEmail, verifyEmailMessage } from '@/lib/auth/email'
import { recordEvent } from '@/lib/auth/events'
import { breachedMessage, checkBreachedPassword, hashPassword, needsRehash, verifyPassword } from '@/lib/auth/password'
import { accountKey, checkRateLimit } from '@/lib/auth/rate-limit'
import type { RequestInfo } from '@/lib/auth/request'
import { startSession } from '@/lib/auth/session'
import { createEmailToken } from '@/lib/auth/tokens'
import { UserSchema, type User } from '@/lib/rows'
import { createUser, findUserByEmail, findUserWithHashByEmail, updatePasswordHash } from '@/lib/users'
import { invalid, ServiceError } from './errors'

/** The same words for every failed sign-in, whatever the reason. */
export const LOGIN_FAILED = 'Email or password is incorrect.'

function rateLimited(message: string, retryAfterSeconds: number) {
  return new ServiceError('rate_limited', 'rate_limited', message, { retryAfterSeconds })
}

/**
 * Checks the password and starts a session (sets the cookie). Throws 401
 * with ONE message for "no such account" and "wrong password" (and argon2
 * runs either way, so they take the same time), 429 when rate-limited.
 */
export async function signIn(input: { email: string; password: string }, request: RequestInfo): Promise<User> {
  const limit = await checkRateLimit('login', request.ip, input.email)
  if (!limit.ok) throw rateLimited(limit.message, limit.retryAfterSeconds)

  const user = await findUserWithHashByEmail(input.email)
  const ok = await verifyPassword(user?.passwordHash ?? null, input.password)
  if (!user || !ok || !user.passwordHash) {
    await recordEvent({ type: 'login_failed', userId: user?.id ?? null, request, metadata: { reason: user ? (user.isDemo ? 'demo_account' : 'wrong_password') : 'no_account' } })
    throw new ServiceError('unauthorized', 'invalid_credentials', LOGIN_FAILED)
  }
  if (needsRehash(user.passwordHash)) await updatePasswordHash(user.id, await hashPassword(input.password))
  await startSession(user.id, request, { type: 'logged_in', userId: user.id, request }, (tx) => [tx`DELETE FROM rate_limits WHERE key = ${accountKey('login', input.email)}`])
  // UserSchema has no passwordHash field, so parsing drops the hash.
  return UserSchema.parse(user)
}

/**
 * Creates a 'guest' account. Same answer whether or not the email was
 * already registered (the difference only reaches that inbox), so sign-up
 * can't be used to test which addresses have accounts.
 */
export async function signUp(input: { name: string; email: string; password: string }, request: RequestInfo): Promise<void> {
  const limit = await checkRateLimit('signup', request.ip, input.email)
  if (!limit.ok) throw rateLimited(limit.message, limit.retryAfterSeconds)

  const breach = await checkBreachedPassword(input.password)
  if (breach.breached) {
    const message = breachedMessage(breach.count)
    throw invalid('breached_password', 'Please choose a different password.', [{ field: 'password', message }])
  }
  const passwordHash = await hashPassword(input.password)
  const userId = await createUser({ name: input.name, email: input.email, passwordHash }, request)

  after(async () => {
    if (userId) {
      const token = await createEmailToken(userId, 'verify_email')
      await sendEmail(verifyEmailMessage(input.email, input.name, token))
    } else {
      const existing = await findUserByEmail(input.email)
      if (existing) await sendEmail(existingAccountMessage(existing.email, existing.name))
    }
  })
}

export const SIGNUP_ACCEPTED = 'Check your inbox: we’ve sent a link to confirm your email address.'
