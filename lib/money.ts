// MONEY: integer kobo everywhere, Naira only on screen (Day 21's module).
//
// ₦1 = 100 kobo. The database stores bigint kobo (listings.nightly_kobo,
// stays.total_kobo, payments.amount_kobo and the rest), the code passes
// whole numbers of kobo around, and only the functions in this file turn
// them into or out of Naira text.
//
// WHY NOT FLOATS? A JavaScript number (and a SQL float or real) is BINARY
// floating point. It can't hold 0.1 exactly, any more than a decimal can
// hold 1/3 exactly, so:
//
//     0.1 + 0.2     → 0.30000000000000004
//     1.15 * 100    → 114.99999999999999   (Math.floor gives 114 kobo!)
//
// A booking total is a sum of nights, a discount, fees and a deposit, and
// it must equal what Paystack charges TO THE KOBO, or the payment is
// refused as a mismatch. Whole kobo are integers, and integer arithmetic
// is exact.
//
// Why `number` and not `bigint` in TypeScript? A JavaScript number holds
// every whole number exactly up to 2^53 (about ₦90 trillion), far beyond any
// stay; every amount that enters (form input, database row) is checked.
//
// Not server-only: the forms and cards format prices in the browser too.

/** The largest single amount accepted from a form: ₦10 billion. */
export const MAX_AMOUNT_KOBO = 1_000_000_000_000

// Prices on cards are whole Naira ("₦85,000"); totals and receipts show kobo.
const NAIRA = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const NAIRA_WHOLE = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** Splits whole kobo into "1250.50" WITHOUT dividing (BigInt keeps it exact). */
function koboToDecimalString(kobo: number): string {
  const value = BigInt(kobo)
  const negative = value < 0n
  const abs = negative ? -value : value
  const naira = abs / 100n
  const rest = (abs % 100n).toString().padStart(2, '0')
  return `${negative ? '-' : ''}${naira}.${rest}`
}

/**
 * 125050 → "₦1,250.50".
 * Intl.NumberFormat.format accepts a decimal STRING and formats it exactly
 * (no conversion to a float on the way), so the kobo are never rounded.
 */
export function formatNaira(kobo: number): string {
  // format() accepts a decimal string since ES2023 (Intl.NumberFormat v3);
  // TypeScript's lib types still only list number | bigint.
  return NAIRA.format(koboToDecimalString(kobo) as unknown as number)
}

/** 8500000 → "₦85,000"; the kobo appear only when there are some (8500050 → "₦85,000.50"). */
export function formatPrice(kobo: number): string {
  return kobo % 100 === 0 ? NAIRA_WHOLE.format(koboToDecimalString(kobo) as unknown as number) : formatNaira(kobo)
}

/** 125050 → "1250.50", the value an edit form starts with. */
export function koboToInput(kobo: number): string {
  const text = koboToDecimalString(kobo)
  return text.endsWith('.00') ? text.slice(0, -3) : text
}

/**
 * The shape of an amount, AFTER the currency sign and spaces are removed:
 *   - whole Naira either with no commas ("12500") or with commas in proper
 *     groups of three ("12,500"): "12,50" is refused, because it is probably
 *     a typo, and guessing with money is wrong;
 *   - optionally a point and ONE or TWO kobo digits ("12500.5" = ₦12,500.50).
 */
const AMOUNT = /^(\d{1,3}(?:,\d{3})+|\d{1,13})(?:\.(\d{1,2}))?$/

function stripCurrency(input: string): string {
  return input.replace(/[\s ]/g, '').replace(/^(₦|NGN|N)/i, '')
}

/**
 * An amount typed into a form: "₦85,000", "85000", "85,000.50" → kobo.
 * Anything else → null. Parsed as TEXT, so "0.1" becomes exactly 10 kobo
 * (parseFloat("0.1") * 100 is 10.000000000000002).
 * `allowZero` is for optional fees ("cleaning fee: 0").
 */
export function parseNaira(input: string, { allowZero = false } = {}): number | null {
  const match = AMOUNT.exec(stripCurrency(input))
  if (!match) return null
  const [, whole = '0', fraction = ''] = match
  const kobo = BigInt(whole.replace(/,/g, '')) * 100n + BigInt(fraction.padEnd(2, '0') || '0')
  if (kobo > BigInt(MAX_AMOUNT_KOBO)) return null
  const value = Number(kobo)
  return value > 0 || (allowZero && value === 0) ? value : null
}

/**
 * A percentage of an amount in whole kobo, ROUNDED HALF UP, with integer
 * arithmetic only: 5% of ₦402,000.00 = (40,200,000 × 5 + 50) ÷ 100, floored
 * = 2,010,000 kobo. Half up means half a kobo (and only half or more) rounds
 * up, the rule a person checking the receipt by hand would use.
 */
export function percentOf(kobo: number, percent: number): number {
  return Math.floor((kobo * percent + 50) / 100)
}

const NAIRA_COMPACT = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 1 })

/** 8500000 → "₦85K", for map pins. Formatted from the exact decimal string, like formatNaira. */
export function formatNairaCompact(kobo: number): string {
  return NAIRA_COMPACT.format(koboToDecimalString(kobo) as unknown as number)
}
