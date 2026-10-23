// CLIENT COMPONENT: a keyboard-first, two-month availability calendar.
'use client'

import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import { addDays, addMonths, dayOfWeek, daysBetween, daysInMonth, formatDayShort, formatLong, formatMonth, type IsoDate } from '@/lib/time'

export type BusyRange = { start: IsoDate; end: IsoDate; kind: 'booking' | 'host_block' }
export type Range = { checkIn: IsoDate | null; checkOut: IsoDate | null }

type Props = {
  today: IsoDate
  lastCheckIn: IsoDate
  minNights: number
  maxNights: number
  busy: BusyRange[]
  value: Range
  onChange: (range: Range) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Monday-first index: Monday 0 ... Sunday 6. */
const mondayIndex = (date: IsoDate) => (dayOfWeek(date) + 6) % 7

/**
 * THE DATE PICKER.
 *
 * - A grid of buttons with ONE tab stop (a "roving tabindex"): Tab lands on
 *   the focused day, then ← → move a day, ↑ ↓ a week, Page Up / Page Down a
 *   month, Home / End the start or end of the week, Enter or Space chooses.
 *   Moving past the visible months turns the page.
 * - Every day has a full accessible name: "Friday, 20 December 2026,
 *   check-in" or "..., booked, not available". A day that can't be chosen
 *   says WHY (in the past, booked, blocked by the host, more than the
 *   maximum nights...), both in its name and in a tooltip, and stays
 *   focusable (aria-disabled, not disabled) so the reason can be heard.
 * - The chosen range and its number of nights are announced in a live
 *   region, so a screen reader user hears the result of every choice.
 * - States never rely on colour alone: check-in and check-out are violet
 *   WITH a label ("In", "Out"); booked nights are muted AND struck through;
 *   host-blocked nights are HATCHED and struck through.
 * - Big targets (44px) for a thumb, and no hover-only information.
 */
export function DatePicker({ today, lastCheckIn, minNights, maxNights, busy, value, onChange }: Props) {
  // Each occupied NIGHT, and what occupies it.
  const busyNights = useMemo(() => {
    const map = new Map<IsoDate, 'booking' | 'host_block'>()
    for (const range of busy) for (let d = range.start; d < range.end; d = addDays(d, 1)) map.set(d, range.kind)
    return map
  }, [busy])

  const [month, setMonth] = useState(() => (value.checkIn ?? today).slice(0, 7))
  const [focused, setFocused] = useState<IsoDate>(value.checkIn ?? today)
  const [message, setMessage] = useState('')
  const grid = useRef<HTMLDivElement>(null)

  const pickingCheckOut = Boolean(value.checkIn && !value.checkOut)
  const lastDay = addDays(lastCheckIn, maxNights)
  const firstMonth = today.slice(0, 7)
  const lastMonth = lastDay.slice(0, 7)
  const months = [month, addMonths(month, 1)]

  /** Why `date` can't be chosen right now, or null if it can. */
  function reason(date: IsoDate): string | null {
    if (date < today) return 'in the past'
    if (pickingCheckOut && value.checkIn) {
      if (date <= value.checkIn) return null // choosing an earlier day starts again with a new check-in
      const nights = daysBetween(value.checkIn, date)
      for (let d = value.checkIn; d < date; d = addDays(d, 1)) {
        if (busyNights.has(d)) return 'booked nights in between'
      }
      if (nights < minNights) return `at least ${minNights} nights`
      if (nights > maxNights) return `at most ${maxNights} nights`
      return null
    }
    if (date > lastCheckIn) return 'more than 12 months ahead'
    const kind = busyNights.get(date)
    if (kind === 'booking') return 'booked, not available'
    if (kind === 'host_block') return 'blocked by the host, not available'
    return null
  }

  function choose(date: IsoDate) {
    const why = reason(date)
    if (why) {
      setMessage(`${formatLong(date)} can’t be chosen: ${why}.`)
      return
    }
    if (pickingCheckOut && value.checkIn && date > value.checkIn) {
      const nights = daysBetween(value.checkIn, date)
      onChange({ checkIn: value.checkIn, checkOut: date })
      setMessage(`${formatDayShort(value.checkIn)} to ${formatDayShort(date)} selected: ${nights} night${nights === 1 ? '' : 's'}.`)
      return
    }
    onChange({ checkIn: date, checkOut: null })
    setMessage(`Check-in ${formatLong(date)}. Now choose your check-out date.`)
  }

  function moveFocus(next: IsoDate) {
    const clamped = next < today ? today : next > lastDay ? lastDay : next
    setFocused(clamped)
    const m = clamped.slice(0, 7)
    if (m < month) setMonth(m)
    else if (m > addMonths(month, 1)) setMonth(addMonths(m, -1))
    // Focus the button once it has rendered.
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-date="${clamped}"]`)?.focus())
  }

  function sameDayInMonth(date: IsoDate, delta: number): IsoDate {
    const m = addMonths(date.slice(0, 7), delta)
    const [y, mo] = m.split('-').map(Number) as [number, number]
    return `${m}-${String(Math.min(Number(date.slice(8)), daysInMonth(y, mo))).padStart(2, '0')}`
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: IsoDate) {
    const moves: Record<string, () => IsoDate> = {
      ArrowLeft: () => addDays(date, -1),
      ArrowRight: () => addDays(date, 1),
      ArrowUp: () => addDays(date, -7),
      ArrowDown: () => addDays(date, 7),
      PageUp: () => sameDayInMonth(date, -1),
      PageDown: () => sameDayInMonth(date, 1),
      Home: () => addDays(date, -mondayIndex(date)),
      End: () => addDays(date, 6 - mondayIndex(date)),
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    moveFocus(move())
  }

  function stateOf(date: IsoDate) {
    const isIn = date === value.checkIn
    const isOut = date === value.checkOut
    const between = Boolean(value.checkIn && value.checkOut && date > value.checkIn && date < value.checkOut)
    return { isIn, isOut, between, kind: busyNights.get(date), why: reason(date) }
  }

  function labelFor(date: IsoDate): string {
    const { isIn, isOut, between, why } = stateOf(date)
    const parts = [formatLong(date)]
    if (isIn) parts.push('check-in')
    if (isOut) parts.push('check-out')
    if (between) parts.push('in your stay')
    if (why) parts.push(why)
    return parts.join(', ')
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" onClick={() => setMonth(addMonths(month, -1))} disabled={month <= firstMonth} className="grid size-11 place-items-center rounded-control text-ink hover:bg-selected disabled:opacity-40">
          <Icon name="chevronLeft" label="Previous month" />
        </button>
        <p className="text-sm text-muted">{pickingCheckOut ? 'Now choose check-out' : 'Choose check-in'}</p>
        <button type="button" onClick={() => setMonth(addMonths(month, 1))} disabled={addMonths(month, 1) >= lastMonth} className="grid size-11 place-items-center rounded-control text-ink hover:bg-selected disabled:opacity-40">
          <Icon name="chevronRight" label="Next month" />
        </button>
      </div>

      <div ref={grid} className="grid gap-5 sm:grid-cols-2">
        {months.map((m) => {
          const first = `${m}-01`
          const [y, mo] = m.split('-').map(Number) as [number, number]
          const count = daysInMonth(y, mo)
          const cells: (IsoDate | null)[] = [...Array<null>(mondayIndex(first)).fill(null), ...Array.from({ length: count }, (_, i) => addDays(first, i))]
          while (cells.length % 7 !== 0) cells.push(null)
          const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
          return (
            <table key={m} role="grid" aria-label={formatMonth(m)} className="w-full table-fixed border-collapse">
              <caption className="mb-1 rounded-control bg-sunken py-1.5 font-display text-lg">{formatMonth(m)}</caption>
              <thead>
                <tr>
                  {WEEKDAYS.map((d) => (
                    <th key={d} scope="col" className="pb-1 text-xs font-semibold text-muted">
                      <abbr title={d} className="no-underline">{d.slice(0, 2)}</abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week, wi) => (
                  <tr key={wi}>
                    {week.map((date, di) => {
                      if (!date) return <td key={di} />
                      const { isIn, isOut, between, kind, why } = stateOf(date)
                      const selected = isIn || isOut
                      return (
                        <td key={date} className={cn('p-0', between && 'bg-range')}>
                          <button
                            type="button"
                            data-date={date}
                            tabIndex={date === focused ? 0 : -1}
                            aria-label={labelFor(date)}
                            aria-pressed={selected}
                            aria-disabled={why ? true : undefined}
                            title={why ? `Not available: ${why}` : undefined}
                            onClick={() => {
                              setFocused(date)
                              choose(date)
                            }}
                            onKeyDown={(event) => onKeyDown(event, date)}
                            className={cn(
                              'relative flex h-11 w-full flex-col items-center justify-center rounded-control text-sm figures',
                              selected && 'bg-primary font-bold text-on-primary',
                              !selected && between && 'text-on-range',
                              !selected && !between && !why && 'text-ink hover:bg-selected',
                              !selected && kind === 'booking' && 'text-muted line-through',
                              !selected && kind === 'host_block' && 'hatched text-muted line-through',
                              !selected && !kind && why && 'text-muted opacity-60',
                            )}
                          >
                            <span aria-hidden>{Number(date.slice(8))}</span>
                            {selected ? <span aria-hidden className="text-[0.6rem] leading-none font-semibold uppercase">{isIn ? 'In' : 'Out'}</span> : null}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        })}
      </div>

      {/* The legend, so every state is explained in words. */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block size-3.5 rounded-sm bg-primary" />Your check-in and check-out</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block size-3.5 rounded-sm bg-range" />Your nights</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="line-through">20</span>Booked</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="hatched inline-block size-3.5 rounded-sm border border-rule" />Blocked by the host</li>
      </ul>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm font-semibold empty:sr-only">{message}</p>
      {value.checkIn ? (
        <button type="button" onClick={() => { onChange({ checkIn: null, checkOut: null }); setMessage('Dates cleared.') }} className="mt-1 text-sm font-semibold text-primary underline">
          Clear dates
        </button>
      ) : null}
    </div>
  )
}

