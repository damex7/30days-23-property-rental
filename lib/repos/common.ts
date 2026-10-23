// Shared pieces for the repos: Zod shapes for values PostgreSQL sends back.
import 'server-only'

import { z } from 'zod'
import { ISO_DATE } from '@/lib/time'

export { int8 } from '@/lib/rows'

/**
 * A calendar date, selected AS TEXT (lower(nights)::text). Left to itself the
 * Pool driver turns a date into a JavaScript Date at midnight in the
 * SERVER's time zone, which can shift it by a day (lib/time.ts explains).
 */
export const isoDate = z.string().regex(ISO_DATE)

/** A numeric column (ratings, coordinates): the driver sends it as text so no precision is lost; ours are small enough for a number. */
export const numeric = z.union([z.string(), z.number()]).transform((value) => Number(value)).pipe(z.number().finite())

/** "14:00:00" (a time column) → "14:00". */
export const clock = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).transform((value) => value.slice(0, 5))

export const uuid = z.uuid()
