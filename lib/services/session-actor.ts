// THE ACTOR FOR PAGES AND SERVER ACTIONS: the signed-in person, read through
// Day 17's DAL (lib/auth/dal.ts), which checks the session against the
// database on every request.
import 'server-only'

import { getCurrentSession, requireRole, verifySession } from '@/lib/auth/dal'
import type { User } from '@/lib/rows'

/** A signed-in user, or a redirect to /login. */
export async function requirePageActor(): Promise<User> {
  return (await verifySession()).user
}

/** Whoever is signed in, or null for a visitor (public pages). */
export async function getPageActor(): Promise<User | null> {
  return (await getCurrentSession())?.user ?? null
}

/** Hosts (and admins) only, or a redirect to the person's own home. */
export async function requireHostPageActor(): Promise<User> {
  return (await requireRole('host', 'admin')).user
}

/** Admins only (/admin). */
export async function requireAdminActor(): Promise<User> {
  return (await requireRole('admin')).user
}
