// SERVER ACTION for the heart button.
'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { fromServiceError } from '@/lib/action-helpers'
import { setSaved } from '@/lib/services/saved'
import { getPageActor } from '@/lib/services/session-actor'

export async function toggleSavedAction(listingId: string, saved: boolean): Promise<{ ok: boolean; message?: string }> {
  const parsed = z.object({ listingId: z.uuid(), saved: z.boolean() }).safeParse({ listingId, saved })
  if (!parsed.success) return { ok: false, message: 'That listing couldn’t be found.' }
  const actor = await getPageActor()
  if (!actor) return { ok: false, message: 'Sign in to save places.' }
  try {
    await setSaved(actor, parsed.data.listingId, parsed.data.saved)
  } catch (error) {
    return { ok: false, message: fromServiceError(error).message }
  }
  refresh()
  return { ok: true }
}
