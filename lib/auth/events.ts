// THE AUDIT LOG: writes auth_events (db/migrations/004 and 006). Day 18 has
// no /account/activity page, so nothing here reads it back; the rows stay
// for the owner to review in the database.
import 'server-only'

import type { NeonQueryFunctionInTransaction, NeonQueryInTransaction } from '@neondatabase/serverless'
import { sqlTransaction } from '@/lib/db'
import type { AuthEventType } from './event-types'
import type { RequestInfo } from './request'

export type TxQuery = NeonQueryFunctionInTransaction<false, false>

export type NewAuthEvent = {
  type: AuthEventType
  /** The account the event is about (null when unknown, e.g. a failed login for no account). */
  userId: string | null
  /** The admin who acted, when it wasn't the user themselves. */
  actorId?: string | null
  request: RequestInfo
  metadata?: Record<string, string | number | boolean | null>
}

/**
 * The INSERT as one query inside sqlTransaction([...]), so the event
 * commits together with the change it describes, or not at all.
 */
export function eventQuery(tx: TxQuery, event: NewAuthEvent): NeonQueryInTransaction {
  return tx`INSERT INTO auth_events (user_id, actor_id, type, ip, user_agent, metadata)
            VALUES (${event.userId}, ${event.actorId ?? null}, ${event.type}, ${event.request.ip},
                    ${event.request.userAgent}, ${JSON.stringify(event.metadata ?? {})}::jsonb)`
}

/** Records one event on its own (still one HTTPS request). */
export async function recordEvent(event: NewAuthEvent): Promise<void> {
  await sqlTransaction((tx) => [eventQuery(tx, event)])
}

