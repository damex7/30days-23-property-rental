// THE WISHLIST: a signed-in person's saved listings. A demo guest's list is
// private to them and is deleted with them (ON DELETE CASCADE).
import 'server-only'

import { http } from '@/lib/db/executor'
import * as repo from '@/lib/repos/saved'
import { requireUser, type Actor } from './actor'
import { notFound } from './errors'

export async function setSaved(actor: Actor, listingId: string, saved: boolean): Promise<void> {
  const user = requireUser(actor)
  const ok = await repo.setSaved(http, user.id, listingId, saved)
  if (!ok) throw notFound('Listing')
}

export function listMySaved(actor: Actor) {
  return repo.listSaved(http, requireUser(actor).id)
}

export async function isSavedByMe(actor: Actor, listingId: string): Promise<boolean> {
  return actor ? repo.isSaved(http, actor.id, listingId) : false
}
