// INTERACTIVE TRANSACTIONS: BEGIN, several statements whose results the
// code READS between steps, then COMMIT (or ROLLBACK on any error).
// (Day 20's withTransaction, unchanged in how it works.)
//
// Staybook needs this wherever several rows must change together:
//   - Reserve: expire this listing's stale holds, re-price, insert the hold
//     and its payment row. The exclusion constraint judges the insert.
//   - Confirming a payment: lock the stay and payment, check the amount,
//     flip held -> confirmed (or record a refund), all or nothing.
//   - Cancelling: free the nights and record the pending refund together.
//   - Reordering photos, blocking nights, approving a listing with its
//     audit event.
//
// THE COST: each statement is a network round trip while the transaction
// holds its locks (about 250 ms from a laptop in Nigeria to Neon in
// Europe; a couple of ms on Vercel in the database's region). So
// transactions here are short, built from a few set-based statements.
//
// The Pool lives for the life of the server process, so connections are
// reused between requests instead of paying for a new WebSocket + TLS +
// login every time. The pooled Neon URL (PgBouncer, transaction mode) is
// fine here: everything a transaction needs happens between BEGIN and COMMIT.
import 'server-only'

import { neonConfig, Pool, type PoolClient } from '@neondatabase/serverless'
import { type Db, type Row } from './executor'
import { compile } from './sql'

// Node 22+ has WebSocket built in; the driver needs to be told to use it.
neonConfig.webSocketConstructor = WebSocket

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local (or add it in Vercel).')
    // A small pool: each serverless instance handles few requests at once,
    // and PgBouncer multiplexes them onto real connections anyway.
    pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 })
    // An idle connection dropped by the server must not crash the process.
    pool.on('error', (error: Error) => console.error('[db] idle pool connection error:', error.message))
  }
  return pool
}

function txExecutor(client: PoolClient): Db {
  return {
    kind: 'tx',
    async query(fragment) {
      const { text, values } = compile(fragment)
      const result = await client.query(text, values)
      return result.rows as Row[]
    },
  }
}

/**
 * Runs `work` inside one transaction and returns its result.
 *
 * If `work` throws (a ServiceError like "those nights were just taken", or
 * a database error), everything it did is ROLLED BACK and the error is
 * re-thrown: no half-made hold, no payment row without its stay.
 *
 * READ COMMITTED (PostgreSQL's default) is enough, because every decision
 * that could race is made by the database itself: a GUARDED UPDATE
 * (`... WHERE version = $expected`) that locks the row and re-checks the
 * condition against the latest committed value, a UNIQUE index, or the
 * stays EXCLUSION constraint, which makes a second overlapping writer wait
 * for the first and then fail.
 */
export async function withTransaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  let broken: Error | undefined
  try {
    await client.query('BEGIN')
    const result = await work(txExecutor(client))
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      // The connection itself failed. Passing the error to release()
      // makes the Pool throw this connection away instead of reusing it.
      broken = rollbackError instanceof Error ? rollbackError : new Error('rollback failed')
    }
    throw error
  } finally {
    client.release(broken)
  }
}

/** Closes the pool, so a script (seed, check) can exit. */
export async function closePool(): Promise<void> {
  if (pool) await pool.end()
  pool = null
}
