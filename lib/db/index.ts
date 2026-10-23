// THE DATABASE CONNECTION. The only file that knows how to reach PostgreSQL.
// lib/users.ts and lib/auth/* import from here; pages and Server Actions never do.
//
// `server-only` makes importing this from a Client Component a BUILD ERROR,
// so DATABASE_URL (which contains the database password) can never be
// bundled into JavaScript sent to the browser.
import 'server-only'

import { neon, type NeonQueryFunction, type NeonQueryFunctionInTransaction, type NeonQueryInTransaction } from '@neondatabase/serverless'

/*
  WHY THE POOLED CONNECTION STRING (the host with "-pooler" in it)?

  PostgreSQL gives every connection its own server process, so it can only
  hold a few hundred at once. On Vercel every request may run in a fresh,
  short-lived function instance, and a traffic spike can start hundreds of
  them, each wanting its own connection. Pointed at the database directly,
  they would exhaust its connection limit and new visitors would get errors.

  The pooled endpoint puts PgBouncer in front: it accepts thousands of
  client connections and lends each one a real PostgreSQL connection only
  for the length of one transaction. Many short-lived functions share a
  handful of real connections.
*/
function connectionString(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local (or add it in Vercel) and paste your Neon pooled connection string.')
  }
  return url
}

let http: NeonQueryFunction<false, false> | null = null

/** Created on first use, so a missing DATABASE_URL fails one request (caught by an error boundary), not the build. */
function client(): NeonQueryFunction<false, false> {
  http ??= neon(connectionString())
  return http
}

/**
 * Runs ONE query as an HTTPS request: no connection to open or close, which
 * makes it the fastest choice for a serverless function.
 *
 * It is a TAGGED TEMPLATE. In sql`SELECT * FROM users WHERE id = ${id}`, the
 * driver never pastes `id` into the SQL text. It sends the text with a
 * placeholder ($1) and the value separately, and PostgreSQL treats the value
 * only as data, never as SQL. That is what makes SQL injection impossible
 * (see the README).
 *
 * Fragments compose: sql`... ${tag ? sql`AND t.name = ${tag}` : sql``}` is
 * still fully parameterised.
 */
export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  return client()(strings, ...values)
}

/**
 * The same HTTPS query, written with $1-style placeholders and a separate
 * values array: the other parameterised style. used for SQL
 * text kept in a constant.
 */
export function sqlQuery(text: string, values: unknown[]) {
  return client().query(text, values)
}

/**
 * Several statements in ONE TRANSACTION, sent as a single HTTPS request: all
 * of them commit, or (if any fails) none do.
 *
 * Why not BEGIN ... COMMIT over a WebSocket session, the "interactive"
 * transaction that scripts/migrate.mts uses? There, every statement is its
 * own round trip, plus the time to open the connection. Measured from
 * Nigeria to Neon in Frankfurt: about 250 ms per round trip, so a
 * step-by-step save took about 2.5 seconds. Here the whole transaction is
 * one round trip. The price: JavaScript can't look at one statement's result
 * before sending the next, so decisions like "did the version match?" are
 * made in SQL instead (see readSession in lib/auth/session.ts).
 */
export function sqlTransaction(build: (tx: NeonQueryFunctionInTransaction<false, false>) => NeonQueryInTransaction[]) {
  return client().transaction(build)
}
