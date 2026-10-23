// THE DATA ACCESS LAYER (DAL): the ONE place that decides "who is this, and
// are they allowed?". Every protected page, Server Action and route handler
// starts by calling verifySession() or requireRole() from here.
//
// Why here and not only in proxy.ts? The proxy runs before a page and only
// checks that a cookie EXISTS (it can't afford a database trip on every
// request, including images and prefetches). An expired, revoked or forged
// cookie passes that check. Also, Server Actions are POST requests to the
// page's URL, and a bug in a matcher can silently skip a route. So the proxy
// is a convenience for fast redirects; the real check is here, next to the
// data, every time.
import 'server-only'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import type { Role } from '@/lib/validation'
import { SESSION_COOKIE } from './cookie'
import { readSession, type SessionWithUser } from './session'

export type { SessionWithUser }

/**
 * The current session and user, or null when signed out.
 *
 * React's cache() MEMOISES it for the length of ONE request: the header,
 * the page and three components can all call it, and the database is asked
 * once (so sliding renewal also happens at most once per request). The next
 * request starts fresh, so a revoked session is rejected right away.
 *
 * Why not 'use cache: private' (which the Next.js docs suggest for session
 * reads)? That keeps the result in the BROWSER for up to 5 minutes, so a
 * session revoked from another device would keep working here for those 5
 * minutes. For a security decision we want every request to ask the database.
 */
export const getCurrentSession = cache(async (): Promise<SessionWithUser | null> => readSession())

/** Where to send someone who needs to sign in, remembering where they were going. */
async function loginUrl(): Promise<string> {
  // proxy.ts copies the requested path into this header for us.
  const path = (await headers()).get('x-staybook-path')
  const hadCookie = (await cookies()).has(SESSION_COOKIE)
  const params = new URLSearchParams()
  if (path) params.set('next', path)
  // A cookie that no longer matches a session: it expired or was revoked.
  if (hadCookie) params.set('reason', 'ended')
  const query = params.toString()
  return query ? `/login?${query}` : '/login'
}

/**
 * Returns the signed-in user and session, or REDIRECTS to /login.
 * redirect() throws, so code after this line only runs for a signed-in user.
 */
export async function verifySession(): Promise<SessionWithUser> {
  const current = await getCurrentSession()
  if (!current) redirect(await loginUrl())
  return current
}

/**
 * Where each role lands after signing in: guests on their trips, hosts on
 * their dashboard, admins on the review queue. Plain data, so the header's
 * navigation uses it too.
 */
export function homePathFor(role: Role): string {
  return role === 'admin' ? '/admin' : role === 'host' ? '/host' : '/trips'
}

/**
 * Requires one of the given roles, or REDIRECTS to the person's own home
 * with ?denied=role.
 *
 * The role is read fresh from the database on every request (it's part of
 * readSession's JOIN), so a demotion takes effect on the very next click.
 *
 * Admin pages also need a VERIFIED email: an admin account whose owner
 * never proved they own the inbox could belong to someone who typed a
 * colleague's address.
 *
 * This answers "may this kind of person use this page at all?". It does
 * NOT answer "may they see THIS booking?": that is ownership, and it lives
 * in the services and the SQL (every query filters on host_id or guest_id,
 * and the composite foreign keys refuse cross-host links). See the README.
 */
export async function requireRole(...roles: [Role, ...Role[]]): Promise<SessionWithUser> {
  const current = await verifySession()
  const { role, emailVerifiedAt } = current.user
  if (!roles.includes(role)) redirect(`${homePathFor(role)}?denied=role`)
  if (role === 'admin' && !emailVerifiedAt) redirect('/verify-email?denied=verify')
  return current
}

/**
 * For ROUTE HANDLERS (the photo upload token). A redirect is the wrong answer to a
 * download, so this returns a status: 401 when signed out, 403 when the role
 * is wrong. Ownership is still checked by the query after this.
 */
export async function authorizeRequest(...roles: [Role, ...Role[]]): Promise<{ ok: true; current: SessionWithUser } | { ok: false; status: 401 | 403 }> {
  const current = await getCurrentSession()
  if (!current) return { ok: false, status: 401 }
  if (!roles.includes(current.user.role)) return { ok: false, status: 403 }
  if (current.user.role === 'admin' && !current.user.emailVerifiedAt) return { ok: false, status: 403 }
  return { ok: true, current }
}
