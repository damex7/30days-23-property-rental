// INPUT SCHEMAS (Zod) for everything that isn't auth (lib/validation.ts has
// those): the search URL, every listing form step, Reserve, reviews, blocks.
// Types come from z.infer, so the rules and the types can't drift apart.
//
// Not server-only: the forms read the limits (maxLength, min, max) too. The
// browser's checks are only a convenience; the server always parses again.
import { z } from 'zod'
import { parseNaira } from './money'
import { AMENITY_GROUPS, CANCELLATION_POLICIES, PROPERTY_TYPES, SORTS } from './options'
import { isValidDate } from './time'

/** A real calendar date "YYYY-MM-DD" ("2026-02-30" is refused). */
export const isoDateSchema = z.string().refine(isValidDate, 'Choose a real date')

// ---------------------------------------------------------------------------
// THE SEARCH URL (/stays?where=lekki&checkin=...&sort=price_asc)
//
// Everything a search needs is in the URL, so a search can be bookmarked,
// shared on WhatsApp, and opened in a new tab. URLs are typed by people and
// mangled by apps, so EVERY field has .catch(): a bad value is dropped (or
// falls back to its default) instead of crashing the page. "guests=lots"
// just means "any number of guests"; "sort=cheapest" means "recommended".
// Rules that involve two fields (check-out after check-in, not in the past)
// are applied by the service, which can say what it ignored and why.
// ---------------------------------------------------------------------------
// An empty box in a GET form arrives as "min=" (an empty string), which
// z.coerce.number would read as 0. Empty means "not set".
const optionalInt = (min: number, max: number) =>
  z.preprocess((value) => (value === '' ? undefined : value), z.coerce.number().int().min(min).max(max).optional()).catch(undefined)

const BBOX_NUMBER = /^-?\d{1,3}(\.\d{1,6})?$/

export const searchParamsSchema = z.object({
  where: z.string().trim().max(60).transform((s) => s || undefined).optional().catch(undefined),
  checkin: isoDateSchema.optional().catch(undefined),
  checkout: isoDateSchema.optional().catch(undefined),
  guests: optionalInt(1, 30),
  // Whole Naira in the URL (min=40000), turned into kobo by the service.
  min: optionalInt(0, 10_000_000),
  max: optionalInt(0, 10_000_000),
  type: z.enum(PROPERTY_TYPES).optional().catch(undefined),
  bedrooms: optionalInt(1, 10),
  // "wifi,power-24-7": split, cleaned, de-duplicated. Unknown codes are
  // dropped later against the amenities table.
  amenities: z
    .string()
    .transform((s) => [...new Set(s.split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(x)))].slice(0, 12))
    .optional()
    .catch(undefined),
  // "south,west,north,east" in degrees, each a plain decimal, inside the
  // world, and south < north, west < east. Anything else: no map filter.
  bbox: z
    .string()
    .transform((s, ctx) => {
      const parts = s.split(',')
      if (parts.length !== 4 || !parts.every((p) => BBOX_NUMBER.test(p))) {
        ctx.addIssue({ code: 'custom', message: 'bad bbox' })
        return z.NEVER
      }
      const [south, west, north, east] = parts.map(Number) as [number, number, number, number]
      if (south >= north || west >= east || south < -90 || north > 90 || west < -180 || east > 180) {
        ctx.addIssue({ code: 'custom', message: 'bad bbox' })
        return z.NEVER
      }
      return { south, west, north, east }
    })
    .optional()
    .catch(undefined),
  sort: z.enum(SORTS).catch('recommended'),
  cursor: z.string().regex(/^[A-Za-z0-9_-]{10,400}$/).optional().catch(undefined),
  // The phone's list/map toggle.
  view: z.enum(['list', 'map']).catch('list'),
})
export type SearchParams = z.infer<typeof searchParamsSchema>

/** searchParams values can be arrays (?type=a&type=b): the first one wins. */
export function firstValues(raw: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
}

// ---------------------------------------------------------------------------
// LISTING FORM STEPS (each step saves only its own fields, as a draft)
// ---------------------------------------------------------------------------
const intField = (label: string, min: number, max: number) =>
  z.coerce
    .number({ error: `Enter ${label}` })
    .int(`Use a whole number for ${label}`)
    .min(min, `${label[0]?.toUpperCase()}${label.slice(1)} must be at least ${min}`)
    .max(max, `${label[0]?.toUpperCase()}${label.slice(1)} can be at most ${max}`)

/** A Naira amount typed in a form ("85,000"), parsed as text into kobo. */
const nairaField = (label: string, { optional = false, allowZero = false, min = 0 } = {}) =>
  z
    .string()
    .trim()
    .transform((text, ctx) => {
      if (text === '') {
        if (optional) return null
        ctx.addIssue({ code: 'custom', message: `Enter the ${label}` })
        return z.NEVER
      }
      const kobo = parseNaira(text, { allowZero })
      if (kobo === null) {
        ctx.addIssue({ code: 'custom', message: `Enter the ${label} in Naira, like 85,000` })
        return z.NEVER
      }
      if (kobo < min) {
        ctx.addIssue({ code: 'custom', message: `The ${label} must be at least ₦${(min / 100).toLocaleString('en-NG')}` })
        return z.NEVER
      }
      return kobo
    })

export const basicsSchema = z.object({
  title: z.string().trim().min(5, 'Give it a title of at least 5 characters').max(90, 'Keep the title to 90 characters'),
  description: z.string().trim().min(40, 'Describe the place in at least 40 characters: what’s it like to stay there?').max(5000, 'Keep it under 5,000 characters'),
  propertyType: z.enum(PROPERTY_TYPES, { error: 'Choose the type of place' }),
  bedrooms: intField('bedrooms', 0, 20),
  bathrooms: intField('bathrooms', 1, 20),
  maxGuests: intField('the number of guests', 1, 30),
})
export type BasicsInput = z.infer<typeof basicsSchema>

export const locationSchema = z.object({
  state: z.string().trim().min(2, 'Enter the state').max(40),
  city: z.string().trim().min(2, 'Enter the city').max(60),
  area: z.string().trim().min(2, 'Enter the area guests will see, like Lekki Phase 1').max(60),
  addressLine: z.string().trim().min(5, 'Enter the street address (only confirmed guests see it)').max(200),
  lat: z.coerce.number({ error: 'Drop the pin on the map, or type the latitude' }).min(4, 'That’s outside Nigeria').max(14, 'That’s outside Nigeria'),
  lng: z.coerce.number({ error: 'Drop the pin on the map, or type the longitude' }).min(2.5, 'That’s outside Nigeria').max(15, 'That’s outside Nigeria'),
})
export type LocationInput = z.infer<typeof locationSchema>

export const pricingSchema = z
  .object({
    nightly: nairaField('nightly price', { min: 500_000 }),
    weekend: nairaField('weekend price', { optional: true, min: 500_000 }),
    cleaningFee: nairaField('cleaning fee', { allowZero: true }),
    cautionDeposit: nairaField('caution deposit', { allowZero: true }),
    weeklyDiscountPercent: intField('the weekly discount', 0, 50),
    minNights: intField('the minimum nights', 1, 30),
    maxNights: intField('the maximum nights', 1, 90),
    cancellationPolicy: z.enum(CANCELLATION_POLICIES, { error: 'Choose a cancellation policy' }),
  })
  .refine((v) => v.maxNights >= v.minNights, { path: ['maxNights'], message: 'The maximum can’t be less than the minimum' })
export type PricingInput = z.infer<typeof pricingSchema>

const clockField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 14:00')

export const rulesSchema = z.object({
  houseRules: z.string().trim().max(2000, 'Keep the house rules under 2,000 characters'),
  checkInTime: clockField,
  checkOutTime: clockField,
  checkinInstructions: z.string().trim().max(2000, 'Keep the instructions under 2,000 characters'),
  amenities: z.array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)).max(40),
})
export type RulesInput = z.infer<typeof rulesSchema>

export const versionSchema = z.coerce.number().int().min(1)

export const LISTING_STEPS = ['basics', 'location', 'photos', 'pricing', 'rules', 'review'] as const
export type ListingStep = (typeof LISTING_STEPS)[number]
export const STEP_LABELS: Record<ListingStep, string> = {
  basics: 'Basics',
  location: 'Location',
  photos: 'Photos',
  pricing: 'Pricing',
  rules: 'Rules & amenities',
  review: 'Review & submit',
}

export const amenityGroupSchema = z.enum(AMENITY_GROUPS)

// ---------------------------------------------------------------------------
// BOOKING
// ---------------------------------------------------------------------------

/** The browser's Idempotency-Key: random, made once per Reserve form. */
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/, 'Reload the page and try again.')

/** What Reserve accepts. Note what's MISSING: any price. The server works it out (lib/pricing.ts). */
export const reserveSchema = z.object({
  listingId: z.uuid(),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  guests: z.coerce.number().int().min(1, 'Choose at least 1 guest').max(30),
  idempotencyKey: idempotencyKeySchema,
})
export type ReserveInput = z.infer<typeof reserveSchema>

export const quoteSchema = z.object({ checkin: isoDateSchema, checkout: isoDateSchema, guests: z.coerce.number().int().min(1).max(30).catch(1) })

const score = (label: string) => z.coerce.number({ error: `Rate the ${label}` }).int().min(1, `Rate the ${label} from 1 to 5`).max(5, `Rate the ${label} from 1 to 5`)

export const reviewSchema = z.object({
  overall: score('stay overall'),
  cleanliness: score('cleanliness'),
  location: score('location'),
  value: score('value'),
  powerSupply: score('power supply'),
  comment: z.string().trim().min(10, 'Write at least 10 characters').max(2000, 'Keep it under 2,000 characters'),
})
export type ReviewInput = z.infer<typeof reviewSchema>

export const hostReplySchema = z.object({ reply: z.string().trim().min(2, 'Write a reply').max(1000, 'Keep it under 1,000 characters') })

/** Calendar edits: the FIRST and LAST night selected (inclusive), turned into [first, last + 1) by the service. */
export const nightsSelectionSchema = z
  .object({ first: isoDateSchema, last: isoDateSchema })
  .refine((v) => v.last >= v.first, { path: ['last'], message: 'The last night can’t be before the first' })

export const blockSchema = z.object({ note: z.string().trim().max(200).optional() })

export const priceRuleSchema = z.object({
  nightly: nairaField('special nightly price', { min: 500_000 }),
  label: z.string().trim().min(2, 'Name it, like “Detty December”').max(40),
})

export const rejectSchema = z.object({ reason: z.string().trim().min(10, 'Tell the host what to change, in at least 10 characters').max(1000) })

/** A Nigerian mobile number in any common shape → +234XXXXXXXXXX. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((s, ctx) => {
    const digits = s.replace(/[\s()-]/g, '')
    const match = /^(?:\+?234|0)([789][01]\d{8})$/.exec(digits)
    if (!match) {
      ctx.addIssue({ code: 'custom', message: 'Enter a Nigerian mobile number, like 0803 123 4567' })
      return z.NEVER
    }
    return `+234${match[1]}`
  })
