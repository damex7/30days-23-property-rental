// SERVER ACTIONS for /admin. Each re-checks the admin role in the service.
'use server'

import { refresh } from 'next/cache'
import { fromServiceError, fromZodError, readUuid, succeeded } from '@/lib/action-helpers'
import { rejectSchema } from '@/lib/schemas'
import { approveListing, rejectListing, suspendHost, unsuspendHost } from '@/lib/services/admin'
import { requireAdminActor } from '@/lib/services/session-actor'
import { failed, field, type FormState } from '@/lib/validation'

export async function approveAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdminActor()
  const id = readUuid(formData)
  if (!id) return failed('That listing couldn’t be found.')
  try {
    await approveListing(actor, id)
  } catch (error) {
    return fromServiceError(error)
  }
  refresh()
  return succeeded('Approved and published. The host has been emailed.')
}

export async function rejectAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdminActor()
  const id = readUuid(formData)
  const values = { reason: field(formData, 'reason') }
  if (!id) return failed('That listing couldn’t be found.', values)
  const parsed = rejectSchema.safeParse(values)
  if (!parsed.success) return fromZodError(parsed.error, values)
  try {
    await rejectListing(actor, id, parsed.data.reason)
  } catch (error) {
    return fromServiceError(error, values)
  }
  refresh()
  return succeeded('Sent back to the host with your reason.')
}

export async function suspendAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdminActor()
  const id = readUuid(formData)
  if (!id) return failed('That host couldn’t be found.')
  try {
    if (field(formData, 'suspend') === 'true') {
      const paused = await suspendHost(actor, id)
      refresh()
      return succeeded(`Suspended. ${paused} listing${paused === 1 ? '' : 's'} paused.`)
    }
    await unsuspendHost(actor, id)
  } catch (error) {
    return fromServiceError(error)
  }
  refresh()
  return succeeded('Suspension lifted. The host can publish their listings again.')
}
