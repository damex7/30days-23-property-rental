// TWO WAYS TO RUN A QUERY, behind one small interface (Db), so a repo
// function works the same inside or outside a transaction.
//
//   http : one query = one HTTPS request to Neon. No connection to open,
//          the fastest choice for a single read or write.
//   tx   : one statement inside an interactive BEGIN ... COMMIT on a
//          WebSocket connection from the Pool (lib/db/tx.ts).
import 'server-only'

import { z } from 'zod'
import { sqlQuery } from './index'
import { compile, type Sql } from './sql'

export type Row = Record<string, unknown>

export interface Db {
  readonly kind: 'http' | 'tx'
  /** Runs one statement and returns its rows. */
  query(fragment: Sql): Promise<Row[]>
}

/** The default executor: each query is its own HTTPS request (and its own implicit transaction). */
export const http: Db = {
  kind: 'http',
  async query(fragment) {
    const { text, values } = compile(fragment)
    return (await sqlQuery(text, values)) as Row[]
  },
}

/** Runs a query and parses every row with Zod; a mismatch names the query. */
export async function rows<T>(db: Db, schema: z.ZodType<T>, fragment: Sql, label: string): Promise<T[]> {
  const result = await db.query(fragment)
  const parsed = z.array(schema).safeParse(result)
  if (!parsed.success) {
    throw new Error(`Rows from ${label} didn't match the expected shape: ${z.prettifyError(parsed.error)}`)
  }
  return parsed.data
}

/** The first row, or null. */
export async function one<T>(db: Db, schema: z.ZodType<T>, fragment: Sql, label: string): Promise<T | null> {
  return (await rows(db, schema, fragment, label))[0] ?? null
}
