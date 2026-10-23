// THE PRICE OF A STAY. The ONE function that turns a listing's prices and
// a pair of dates into a total. Everything that shows or charges a price
// calls it: the result cards (total for your dates), the booking panel's
// live quote (/api/listings/[id]/quote), and Reserve itself, which runs it
// AGAIN on the server and freezes the result on the stay.
//
// WHY THE BROWSER NEVER SENDS A PRICE. Anything a browser sends can be
// edited: a guest could change "total=47210000" to "total=100" in the
// request. So Reserve takes only the listing, the dates and the number of
// guests, and works the price out here from the database's own numbers.
// Paystack is then asked for exactly that amount, and a payment for any
// other amount is refused (lib/services/payments.ts).
//
// THE RULES, in order:
//   1. Each NIGHT is priced on its own, as a Lagos calendar date:
//        a host's special price for that date (price_rules), else
//        weekend_kobo for Friday and Saturday nights (if set), else
//        nightly_kobo.
//   2. Stays of 7+ nights: weekly_discount_percent off the nightly SUBTOTAL
//      (not off the cleaning fee or the deposit).
//   3. + the cleaning fee, once.
//   4. + a 5% GUEST SERVICE FEE on (subtotal - discount + cleaning).
//   5. + the refundable CAUTION DEPOSIT (no fee is charged on it: it's the
//      guest's own money, held).
// Every percentage is rounded HALF UP to whole kobo (lib/money.ts percentOf).
//
// Pure (no database, no clock), so the check script tests it against a
// total worked out by hand, and it runs anywhere.
import { percentOf } from './money'
import { isWeekendNight, nightsOf, type IsoDate } from './time'

export const SERVICE_FEE_PERCENT = 5
export const WEEKLY_DISCOUNT_MIN_NIGHTS = 7

export type ListingPrices = {
  nightlyKobo: number
  weekendKobo: number | null
  cleaningFeeKobo: number
  cautionDepositKobo: number
  weeklyDiscountPercent: number
}

/** A host's special price for some nights: [start, end), like stays. */
export type PriceRule = { start: IsoDate; end: IsoDate; nightlyKobo: number; label: string }

export type NightLine = { date: IsoDate; kind: 'weekday' | 'weekend' | 'special'; kobo: number; label?: string }

export type Quote = {
  checkIn: IsoDate
  checkOut: IsoDate
  nights: NightLine[]
  nightCount: number
  subtotalKobo: number
  discountKobo: number
  discountPercent: number
  cleaningFeeKobo: number
  serviceFeeKobo: number
  cautionDepositKobo: number
  totalKobo: number
}

/** The price of one night. */
function priceNight(date: IsoDate, prices: ListingPrices, rules: readonly PriceRule[]): NightLine {
  const rule = rules.find((r) => r.start <= date && date < r.end)
  if (rule) return { date, kind: 'special', kobo: rule.nightlyKobo, label: rule.label }
  if (prices.weekendKobo !== null && isWeekendNight(date)) return { date, kind: 'weekend', kobo: prices.weekendKobo }
  return { date, kind: 'weekday', kobo: prices.nightlyKobo }
}

/** Works out the full price. checkOut must be after checkIn (the services check the rules first). */
export function quoteStay(prices: ListingPrices, checkIn: IsoDate, checkOut: IsoDate, rules: readonly PriceRule[] = []): Quote {
  const nights = nightsOf(checkIn, checkOut).map((date) => priceNight(date, prices, rules))
  if (nights.length === 0) throw new Error('quoteStay: check-out must be after check-in')
  const subtotalKobo = nights.reduce((sum, night) => sum + night.kobo, 0)
  const discountPercent = nights.length >= WEEKLY_DISCOUNT_MIN_NIGHTS ? prices.weeklyDiscountPercent : 0
  const discountKobo = percentOf(subtotalKobo, discountPercent)
  const serviceFeeKobo = percentOf(subtotalKobo - discountKobo + prices.cleaningFeeKobo, SERVICE_FEE_PERCENT)
  const totalKobo = subtotalKobo - discountKobo + prices.cleaningFeeKobo + serviceFeeKobo + prices.cautionDepositKobo
  return {
    checkIn,
    checkOut,
    nights,
    nightCount: nights.length,
    subtotalKobo,
    discountKobo,
    discountPercent,
    cleaningFeeKobo: prices.cleaningFeeKobo,
    serviceFeeKobo,
    cautionDepositKobo: prices.cautionDepositKobo,
    totalKobo,
  }
}

/** Groups equal nights for display: "4 weekday nights × ₦50,000", "2 weekend nights × ₦65,000". */
export function summariseNights(nights: readonly NightLine[]): { label: string; count: number; kobo: number; totalKobo: number }[] {
  const groups = new Map<string, { label: string; count: number; kobo: number; totalKobo: number }>()
  for (const night of nights) {
    const name = night.kind === 'special' ? (night.label ?? 'Special price') : night.kind === 'weekend' ? 'Weekend' : 'Weekday'
    const key = `${name}|${night.kobo}`
    const group = groups.get(key) ?? { label: name, count: 0, kobo: night.kobo, totalKobo: 0 }
    group.count += 1
    group.totalKobo += night.kobo
    groups.set(key, group)
  }
  return [...groups.values()]
}
