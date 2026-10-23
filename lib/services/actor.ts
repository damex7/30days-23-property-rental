// THE ACTOR: who is asking. Every service function takes one as its FIRST
// argument, so "may this person see or change this?" is never an afterthought.
//
//   Actor = User | null
//     a User : someone signed in with the session cookie (guest, host or admin).
//     null   : a visitor. They can search and read published listings, and
//              nothing else; the services answer "please sign in" for the rest.
//
//   SystemActor : the app itself, for work no person triggers: Paystack's
//     webhook confirming a payment, the daily cron, the seed and the check
//     script. Only the functions that need it accept it, so a page can't
//     pass "system" to skip an ownership check.
//
// The transport works out the actor (lib/services/session-actor.ts for pages
// and Server Actions); the services only ever see this type, never cookies.
import 'server-only'

import type { User } from '@/lib/rows'
import { forbidden, unauthorized } from './errors'

export type Actor = User | null

export type SystemActor = { kind: 'system'; label: 'Paystack' | 'Daily cron' | 'Lazy sweep' | 'Seed' | 'Check script' | 'Demo' }

export function systemActor(label: SystemActor['label']): SystemActor {
  return { kind: 'system', label }
}

/** A signed-in person, or 401 "please sign in". */
export function requireUser(actor: Actor): User {
  if (!actor) throw unauthorized()
  return actor
}

/** The one message every refused demo-host write uses. */
export const DEMO_READ_ONLY_MESSAGE = 'This is the shared demo host, so it’s read-only: you can look around, but changes are switched off. Sign up to list a place of your own.'

/**
 * THE SHARED DEMO HOST IS READ-ONLY (the Day 20 rule, in one place). Demo
 * GUESTS are private to one visitor, so they may book and review; the demo
 * HOST is shared by everyone who clicks "Look around as a host", so one
 * visitor's edits would show up for the next. Every host write calls this.
 */
export function assertCanWrite(user: User): void {
  if (user.isDemo && user.role === 'host') throw forbidden('demo_read_only', DEMO_READ_ONLY_MESSAGE)
}

/** A host (or admin acting as one) who may change their own listings. */
export function requireHost(actor: Actor, { write }: { write: boolean }): User {
  const user = requireUser(actor)
  if (user.role !== 'host' && user.role !== 'admin') throw forbidden('not_a_host', 'Become a host first: /host/start.')
  if (write) {
    assertCanWrite(user)
    if (user.suspendedAt) throw forbidden('suspended', 'Your hosting account is suspended. Contact support to have it reviewed.')
  }
  return user
}

export function requireAdmin(actor: Actor): User {
  const user = requireUser(actor)
  if (user.role !== 'admin' || !user.emailVerifiedAt) throw forbidden('admin_only', 'Only admins can do this.')
  return user
}
