// npm run db:explain
//
// Runs EXPLAIN (ANALYZE, BUFFERS) on the REAL search query (the same
// searchSql() the /stays page uses, compiled the same way) for three
// searches, and prints the plans for the README:
//   1. a place only:                    "lekki"
//   2. a place + dates + guests:        the NOT EXISTS availability check
//   3. dates + map box + amenities:     every filter at once
// and a second page (with a keyset cursor) to show that later pages seek
// straight to the cursor instead of counting past earlier rows.
//
// TWO RUNS OF EACH. With the seed's ~20 listings a sequential scan IS the
// fastest plan (reading two 8 kB pages beats any index), so PostgreSQL
// rightly picks it. The second run sets enable_seqscan = off for that
// transaction only, which makes the planner show WHICH index it would use
// for each part once the table is big enough to need one. Both are
// printed, labelled, so the README never claims an index the planner
// didn't choose. Everything runs inside a transaction that is rolled back.

import { neonConfig, Pool } from '@neondatabase/serverless'
import { compile } from '@/lib/db/sql'
import { searchSql, type SearchQuery } from '@/lib/repos/search'
import { addDays, todayInLagos } from '@/lib/time'

neonConfig.webSocketConstructor = WebSocket

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const today = todayInLagos()
const base: SearchQuery = {
  where: null,
  checkIn: null,
  checkOut: null,
  nights: null,
  guests: null,
  minKobo: null,
  maxKobo: null,
  type: null,
  bedrooms: null,
  amenities: [],
  bbox: null,
  sort: 'recommended',
  after: null,
  limit: 12,
  viewerId: null,
}
const checkIn = addDays(today, 6)
const checkOut = addDays(today, 9)

const CASES: { title: string; query: SearchQuery }[] = [
  { title: '1. Place only: where = "lekki"', query: { ...base, where: 'lekki' } },
  { title: `2. Place + dates (${checkIn} to ${checkOut}) + 2 guests`, query: { ...base, where: 'lekki', checkIn, checkOut, nights: 3, guests: 2 } },
  {
    title: '3. Dates + Lagos map box + amenities (wifi, power-24-7), sorted by price',
    query: { ...base, checkIn, checkOut, nights: 3, bbox: { south: 6.40, west: 3.35, north: 6.55, east: 3.50 }, amenities: ['wifi', 'power-24-7'], sort: 'price_asc' },
  },
  { title: '4. Page 2 of "price low to high" (keyset cursor, no window count)', query: { ...base, sort: 'price_asc', after: ['5000000', '00000000-0000-0000-0000-000000000000'] } },
]

// THE "WHERE" INDEXES, one at a time. With ~20 rows the planner prefers to
// walk the ORDER BY index and filter the OR of the three "where" tests (case
// 1), which is right at this size. These probes show that each test CAN be
// answered by its GIN index once a table is big enough to need it.
const PROBES: { title: string; sql: string; values: unknown[] }[] = [
  { title: '5a. Full-text: search @@ "lekki" (GIN on the tsvector)', sql: `SELECT id FROM listings WHERE search @@ websearch_to_tsquery('simple', $1)`, values: ['lekki'] },
  { title: '5b. Fuzzy: "leki" <% area (GIN trigram on area)', sql: `SELECT id, area FROM listings WHERE $1 <% area`, values: ['leki'] },
  { title: '5c. Fuzzy: "abuj" <% city (GIN trigram on city)', sql: `SELECT id, city FROM listings WHERE $1 <% city`, values: ['abuj'] },
]

const pool = new Pool({ connectionString })
const client = await pool.connect()
try {
  for (const { title, query } of CASES) {
    const { text, values } = compile(searchSql(query))
    for (const forceIndexes of [false, true]) {
      await client.query('BEGIN')
      try {
        if (forceIndexes) await client.query('SET LOCAL enable_seqscan = off')
        const result = await client.query<{ 'QUERY PLAN': string }>(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, SUMMARY ON) ${text}`, values)
        console.log(`\n=== ${title}${forceIndexes ? '  [enable_seqscan = off: the indexes it can use]' : '  [as planned]'} ===`)
        for (const row of result.rows) console.log(row['QUERY PLAN'])
      } finally {
        await client.query('ROLLBACK')
      }
    }
  }
  for (const probe of PROBES) {
    await client.query('BEGIN')
    try {
      await client.query('SET LOCAL enable_seqscan = off')
      const result = await client.query<{ 'QUERY PLAN': string }>(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, SUMMARY ON) ${probe.sql}`, probe.values)
      console.log(`
=== ${probe.title}  [enable_seqscan = off] ===`)
      for (const row of result.rows) console.log(row['QUERY PLAN'])
    } finally {
      await client.query('ROLLBACK')
    }
  }
} finally {
  client.release()
  await pool.end()
}
