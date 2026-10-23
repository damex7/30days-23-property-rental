// SQL FRAGMENTS for the repos (lib/repos/*).
//
// q`SELECT * FROM listings WHERE id = ${id}` builds a fragment: the SQL text
// pieces and the values, kept APART. When it runs, the values become $1,
// $2, ... and travel separately from the text, so PostgreSQL only ever
// treats them as data. That is what makes SQL injection impossible, exactly
// like Day 16's tagged template, with one addition: fragments nest.
//
//   const where = type ? q`AND l.property_type = ${type}` : empty
//   await db.query(q`SELECT ... WHERE l.status = 'published' ${where}`)
//
// The same fragment runs on either executor (lib/db/executor.ts): one-shot
// over HTTP, or inside an interactive transaction over the WebSocket Pool.
// That is why the repos take `db` as a parameter: the SERVICE decides
// whether a group of repo calls shares one transaction.
//
// There is deliberately no "raw" escape hatch. Things that can't be a
// parameter (a sort direction, a column name) are chosen from whole
// fragments written in the code, never built from input.

export class Sql {
  readonly strings: readonly string[]
  readonly values: readonly unknown[]
  // Plain fields, not constructor parameter properties: scripts/check-bookings
  // runs this file with Node's built-in TypeScript stripping, which only
  // removes types and can't generate code (tsconfig: erasableSyntaxOnly).
  constructor(strings: readonly string[], values: readonly unknown[]) {
    this.strings = strings
    this.values = values
  }
}

/** Builds a fragment. Values may themselves be fragments; they are spliced in. */
export function q(strings: TemplateStringsArray, ...values: unknown[]): Sql {
  return new Sql([...strings], values)
}

/** The fragment that adds nothing (an optional filter that isn't set). */
export const empty = new Sql([''], [])

/** Joins fragments with a separator: join([a, b], ' AND '). */
export function join(parts: readonly Sql[], separator: string): Sql {
  if (parts.length === 0) return empty
  // n parts sit between n + 1 text pieces: '', sep, sep, ..., ''.
  const strings = ['', ...parts.slice(1).map(() => separator), '']
  return new Sql(strings, parts)
}

/** Turns a fragment into PostgreSQL's "text with $1, $2" plus the values array. */
export function compile(fragment: Sql): { text: string; values: unknown[] } {
  const values: unknown[] = []
  let text = ''
  const walk = (f: Sql) => {
    f.strings.forEach((piece, i) => {
      text += piece
      if (i < f.values.length) {
        const value = f.values[i]
        if (value instanceof Sql) walk(value)
        else {
          values.push(value)
          text += `$${values.length}`
        }
      }
    })
  }
  walk(fragment)
  return { text, values }
}
