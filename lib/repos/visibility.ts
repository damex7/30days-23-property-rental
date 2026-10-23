// "IS THIS ROW YOURS?" for proxy.ts: one indexed query from the session
// cookie's hash straight to the row. SQL only.
import 'server-only'

import { sql } from '@/lib/db'

export type Visibility = 'visible' | 'hidden' | 'signed-out'

/** The URL kinds: /trips/<id> (a guest's booking) and /host/listings/<id> (a host's listing). */
export type OwnedKind = 'trips' | 'host-listings'

/**
 * 'hidden' when the session is valid but the row doesn't exist OR belongs
 * to someone else (the same answer for both: a 404 either way), 'signed-out'
 * when the session itself isn't valid (the page then redirects to login).
 */
export async function rowVisibility(sessionHash: string, kind: OwnedKind, id: string): Promise<Visibility> {
  // Two fixed queries rather than a table name pasted into SQL: values are
  // parameters, but a table name can't be, so it's chosen from code.
  const rows =
    kind === 'trips'
      ? await sql`SELECT s.user_id, EXISTS (SELECT 1 FROM stays t WHERE t.guest_id = s.user_id AND t.id = ${id} AND t.kind = 'booking') AS owned
                  FROM sessions s WHERE s.id = ${sessionHash} AND s.expires_at > now()`
      : await sql`SELECT s.user_id, EXISTS (SELECT 1 FROM listings l WHERE l.host_id = s.user_id AND l.id = ${id}) AS owned
                  FROM sessions s WHERE s.id = ${sessionHash} AND s.expires_at > now()`
  const row = rows[0]
  if (!row) return 'signed-out'
  return row.owned === true ? 'visible' : 'hidden'
}
