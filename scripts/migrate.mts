// npm run db:migrate
//
// Applies every db/migrations/NNN_*.sql file that hasn't been applied yet, in
// filename order, and records each one in schema_migrations so it never runs
// twice. Run it as often as you like: with nothing new to apply it does
// nothing.
//
// WHY MIGRATIONS INSTEAD OF EDITING TABLES BY HAND in the Neon console:
// - Every database (yours, a teammate's, a preview branch, production) ends
//   up with the SAME schema, built by the same steps in the same order.
// - The schema's history lives in git next to the code that needs it, so a
//   commit that adds a column also adds the migration that creates it.
// - A fresh database is rebuilt with one command instead of from memory.
//
// Runs with Node's built-in TypeScript support (no build step), so it uses
// only "erasable" TypeScript: type annotations, no enums or namespaces.

import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { neonConfig, Pool } from '@neondatabase/serverless'

// Pool talks to Neon over a WebSocket; Node 22+ has one built in.
neonConfig.webSocketConstructor = WebSocket

// Schema changes prefer the DIRECT connection when it's configured: one real
// PostgreSQL session, not one borrowed from the pooler per transaction.
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and paste your Neon connection string.')
  process.exit(1)
}

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'db', 'migrations')

// Any fixed number: every migrate run takes this lock, so two runs at once
// (two terminals, two deploys) take turns instead of applying a file twice.
const MIGRATION_LOCK_KEY = 23_2026

/** sha256 of the file, ignoring Windows/Unix line-ending differences. */
function checksum(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex')
}

const pool = new Pool({ connectionString })
const client = await pool.connect()

try {
  // The bookkeeping table. IF NOT EXISTS makes this line safe to run every time.
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text        PRIMARY KEY,
      checksum   text        NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f)).sort()
  let applied = 0

  for (const filename of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf8')
    const sum = checksum(sql)

    // One TRANSACTION per file: either every statement in the file runs AND
    // it is recorded as applied, or (on any error) none of it happened.
    // PostgreSQL can roll back CREATE TABLE and ALTER TABLE too, so a typo
    // halfway through never leaves a half-built schema behind.
    await client.query('BEGIN')
    try {
      await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY])
      const { rows } = await client.query<{ checksum: string }>('SELECT checksum FROM schema_migrations WHERE filename = $1', [filename])
      const previous = rows[0]

      if (previous) {
        await client.query('COMMIT')
        if (previous.checksum !== sum) {
          console.warn(`! ${filename} has CHANGED since it was applied. Applied migrations are history: put the change in a new file instead.`)
        }
        continue
      }

      // No parameters, so this uses PostgreSQL's "simple query" protocol,
      // which allows a whole file of statements in one call.
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [filename, sum])
      await client.query('COMMIT')
      console.log(`✓ applied ${filename}`)
      applied++
    } catch (error) {
      await client.query('ROLLBACK')
      console.error(`✗ ${filename} failed and was rolled back.`)
      throw error
    }
  }

  console.log(applied === 0 ? 'Database is up to date. Nothing to apply.' : `Done: ${applied} migration(s) applied.`)
} finally {
  client.release()
  await pool.end()
}
