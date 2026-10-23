// THE DATE RULES for a stay, in one pure place: search uses them to decide
// whether to apply the dates in a URL, the date picker uses them to grey out
// days, and Reserve applies them again on the server (the only check that
// counts). "Today" is always Lagos today (lib/time.ts).
import { BOOKING_WINDOW_MONTHS } from './options'
import { addMonths, daysBetween, daysInMonth, type IsoDate } from './time'

/** The last date a check-in may be: the same day 12 months from today (or that month's last day). */
export function lastCheckInDate(today: IsoDate): IsoDate {
  const month = addMonths(today.slice(0, 7), BOOKING_WINDOW_MONTHS)
  const [y, m] = month.split('-').map(Number) as [number, number]
  const day = Math.min(Number(today.slice(8)), daysInMonth(y, m))
  return `${month}-${String(day).padStart(2, '0')}`
}

export type DateRuleInput = { checkIn: IsoDate; checkOut: IsoDate; today: IsoDate; minNights?: number; maxNights?: number }

/** Why these dates can't be booked, in words, or null if they're fine. */
export function dateProblem({ checkIn, checkOut, today, minNights = 1, maxNights = 90 }: DateRuleInput): string | null {
  const nights = daysBetween(checkIn, checkOut)
  if (checkIn < today) return 'Check-in can’t be in the past.'
  if (checkIn > lastCheckInDate(today)) return `You can book up to ${BOOKING_WINDOW_MONTHS} months ahead.`
  if (nights < 1) return 'Check-out must be after check-in.'
  if (nights < minNights) return `This place needs at least ${minNights} night${minNights === 1 ? '' : 's'}.`
  if (nights > maxNights) return `This place can be booked for at most ${maxNights} nights.`
  return null
}
