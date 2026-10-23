// CLIENT COMPONENT: the host's month view. Choose nights, then block,
// unblock or price them.
'use client'

import { useActionState, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { calendarAction } from '@/app/host/actions'
import { NairaField, TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { Notice } from '@/components/ui/notice'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/money'
import { addDays, dayOfWeek, daysInMonth, formatDayShort, formatLong, type IsoDate } from '@/lib/time'
import type { FormState } from '@/lib/validation'

type CalStay = { id: string; kind: 'booking' | 'host_block'; start: IsoDate; end: IsoDate; status: string; guestFirstName: string | null; note: string | null }
type Rule = { id: string; start: IsoDate; end: IsoDate; nightlyKobo: number; label: string }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * THE HOST CALENDAR. Click (or Enter) a first night and a last night; the
 * panel then offers Block, Unblock or a special price for those nights.
 *   - booked nights show the guest's FIRST name, muted and struck through;
 *   - blocked nights are HATCHED, with the note;
 *   - special prices show their nightly price;
 * each state also in words in the day's accessible name. A booked or
 * already-blocked night can't be blocked again: the database's exclusion
 * constraint refuses it, and the message says so.
 */
export function HostCalendar({ listingId, month, today, stays, rules, nightlyKobo, readOnly }: { listingId: string; month: string; today: IsoDate; stays: CalStay[]; rules: Rule[]; nightlyKobo: number | null; readOnly: boolean }) {
  const [first, setFirst] = useState<IsoDate | null>(null)
  const [last, setLast] = useState<IsoDate | null>(null)
  const [focused, setFocused] = useState<IsoDate>(month === today.slice(0, 7) ? today : `${month}-01`)
  const [state, action] = useActionState(calendarAction, { status: 'idle' } satisfies FormState)
  const grid = useRef<HTMLTableElement>(null)

  const byNight = useMemo(() => {
    const map = new Map<IsoDate, CalStay>()
    for (const s of stays) for (let d = s.start; d < s.end; d = addDays(d, 1)) if (s.status !== 'cancelled' && s.status !== 'expired') map.set(d, s)
    return map
  }, [stays])
  const ruleOf = (date: IsoDate) => rules.find((r) => r.start <= date && date < r.end)

  const [y, m] = month.split('-').map(Number) as [number, number]
  const count = daysInMonth(y, m)
  const start = `${month}-01`
  const lead = (dayOfWeek(start) + 6) % 7
  const cells: (IsoDate | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => addDays(start, i))]
  while (cells.length % 7) cells.push(null)

  const lo = first && last ? (first < last ? first : last) : first
  const hi = first && last ? (first < last ? last : first) : first

  function choose(date: IsoDate) {
    if (date < today) return
    if (!first || last) {
      setFirst(date)
      setLast(null)
    } else setLast(date)
  }

  function label(date: IsoDate): string {
    const stay = byNight.get(date)
    const rule = ruleOf(date)
    const parts = [formatLong(date)]
    if (date < today) parts.push('in the past')
    if (stay?.kind === 'booking') parts.push(`booked by ${stay.guestFirstName ?? 'a guest'}${stay.status === 'held' ? ' (waiting for payment)' : ''}`)
    if (stay?.kind === 'host_block') parts.push(`blocked${stay.note ? `: ${stay.note}` : ''}`)
    if (rule) parts.push(`${rule.label}, ${formatPrice(rule.nightlyKobo)} a night`)
    if (lo && hi && date >= lo && date <= hi) parts.push('selected')
    return parts.join(', ')
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: IsoDate) {
    const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    const step = delta[event.key]
    if (step === undefined) return
    event.preventDefault()
    const next = addDays(date, step)
    if (next.slice(0, 7) !== month) return
    setFocused(next)
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus())
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div>
        <table ref={grid} role="grid" aria-label="Nights this month" className="w-full table-fixed border-collapse">
          <thead>
            <tr>{WEEKDAYS.map((d) => <th key={d} scope="col" className="bg-sunken py-1.5 text-xs font-semibold text-muted">{d}</th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: cells.length / 7 }, (_, w) => (
              <tr key={w}>
                {cells.slice(w * 7, w * 7 + 7).map((date, i) => {
                  if (!date) return <td key={i} className="border border-rule bg-page" />
                  const stay = byNight.get(date)
                  const rule = ruleOf(date)
                  const selected = Boolean(lo && hi && date >= lo && date <= hi)
                  const past = date < today
                  return (
                    <td key={date} className="border border-rule p-0 align-top">
                      <button
                        type="button"
                        data-date={date}
                        tabIndex={date === focused ? 0 : -1}
                        aria-label={label(date)}
                        aria-pressed={selected}
                        aria-disabled={past || undefined}
                        onClick={() => { setFocused(date); choose(date) }}
                        onKeyDown={(e) => onKeyDown(e, date)}
                        className={cn(
                          'flex min-h-20 w-full flex-col items-start gap-0.5 p-1.5 text-left text-xs',
                          selected ? 'bg-primary text-on-primary' : stay?.kind === 'host_block' ? 'hatched' : stay?.kind === 'booking' ? 'bg-sunken' : 'bg-card hover:bg-selected',
                          past && !selected && 'opacity-50',
                        )}
                      >
                        <span aria-hidden className={cn('text-sm font-semibold figures', stay && !selected && 'line-through')}>{Number(date.slice(8))}</span>
                        {stay?.kind === 'booking' ? <span aria-hidden className="truncate font-semibold">{stay.guestFirstName ?? 'Guest'}{stay.status === 'held' ? ' (held)' : ''}</span> : null}
                        {stay?.kind === 'host_block' ? <span aria-hidden className="truncate">Blocked</span> : null}
                        {rule && !stay ? <span aria-hidden className="truncate figures">{formatPrice(rule.nightlyKobo)}</span> : null}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block size-3.5 rounded-sm bg-sunken" />Booked (guest’s first name)</li>
          <li className="flex items-center gap-1.5"><span aria-hidden className="hatched inline-block size-3.5 rounded-sm border border-rule" />Blocked by you</li>
          <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block size-3.5 rounded-sm bg-primary" />Selected</li>
          {nightlyKobo !== null ? <li>Other nights: {formatPrice(nightlyKobo)}</li> : null}
        </ul>
      </div>

      <aside className="panel h-fit p-5" aria-labelledby="sel-title">
        <h2 id="sel-title" className="text-xl">Selected nights</h2>
        <p aria-live="polite" className="mt-1 text-sm">
          {!lo ? 'Choose the first night.' : !last ? `${formatDayShort(lo)}. Now choose the last night (or the same night again).` : `${formatDayShort(lo!)} to ${formatDayShort(hi!)} (${Math.round((Date.parse(hi!) - Date.parse(lo!)) / 86_400_000) + 1} nights)`}
        </p>
        {state.status !== 'idle' ? (
          <Notice tone={state.status === 'success' ? 'success' : 'danger'} title={state.message ?? ''} className="mt-3" live />
        ) : null}
        {readOnly ? (
          <p className="mt-3 text-sm text-muted">The demo host is read-only.</p>
        ) : lo && last ? (
          <form action={action} className="mt-4 space-y-3">
            <input type="hidden" name="id" value={listingId} />
            <input type="hidden" name="first" value={lo} />
            <input type="hidden" name="last" value={hi!} />
            <TextField name="note" label="Note (only you see it)" placeholder="Family visiting" maxLength={200} defaultValue={state.values?.note} />
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="intent" value="block" pendingLabel="Blocking…">Block nights</SubmitButton>
              <SubmitButton name="intent" value="unblock" variant="secondary" pendingLabel="Opening…">Unblock</SubmitButton>
            </div>
            <details className="rounded-control border border-rule p-3">
              <summary className="cursor-pointer font-semibold">Set a special price</summary>
              <div className="mt-3 space-y-3">
                <NairaField name="nightly" label="Price per night" defaultValue={state.values?.nightly} errors={state.fieldErrors?.nightly} />
                <TextField name="label" label="Name" placeholder="Detty December" maxLength={40} defaultValue={state.values?.label} errors={state.fieldErrors?.label} />
                <SubmitButton name="intent" value="price" variant="secondary" pendingLabel="Saving…">Save price</SubmitButton>
              </div>
            </details>
          </form>
        ) : null}
      </aside>
    </div>
  )
}
