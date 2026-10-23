// CLIENT COMPONENT: dates, guests, a live quote and the Reserve button.
'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'
import { reserveAction } from '@/app/stays/[slug]/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { SubmitButton } from '@/components/forms/submit-button'
import { button } from '@/components/ui/button'
import { formatNaira, formatPrice } from '@/lib/money'
import { HOLD_MINUTES } from '@/lib/options'
import { summariseNights, type Quote } from '@/lib/pricing'
import { formatRange } from '@/lib/time'
import type { FormState } from '@/lib/validation'
import { DatePicker, type BusyRange, type Range } from './date-picker'

type Props = {
  listing: { id: string; slug: string; nightlyKobo: number; maxGuests: number }
  availability: { today: string; lastCheckIn: string; minNights: number; maxNights: number; busy: BusyRange[] }
  initial: { checkIn: string | null; checkOut: string | null; guests: number }
  signedIn: boolean
  isOwn: boolean
  /** A random key made by the server for this page view (so server and browser render the same value). */
  idempotencyKey: string
}

type QuoteState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; quote: Quote } | { status: 'problem'; problem: string }

/**
 * THE BOOKING PANEL. The price shown here is fetched from the SERVER
 * (/api/listings/<id>/quote), which runs the same pricing function as
 * Reserve: the browser only ever displays prices, it never sends one.
 *
 * THE IDEMPOTENCY KEY is made once per page view and sent with Reserve.
 * Tapping twice (or the network retrying) sends the same key, and the
 * server hands back the same hold instead of making a second. After the
 * server says an attempt FAILED, the key changes (the failed submission's
 * id is appended), so a deliberate retry is a new attempt.
 */
export function BookingPanel({ listing, availability, initial, signedIn, isOwn, idempotencyKey }: Props) {
  const [range, setRange] = useState<Range>({ checkIn: initial.checkIn, checkOut: initial.checkOut })
  const [guests, setGuests] = useState(Math.min(Math.max(initial.guests, 1), listing.maxGuests))
  // The last answer from the server, labelled with the dates it was for. The
  // shown state is DERIVED from it: different dates than the answer = loading.
  const [fetched, setFetched] = useState<{ key: string; state: QuoteState } | null>(null)
  const [state, action] = useActionState(reserveAction, { status: 'idle' } satisfies FormState)
  const panel = useRef<HTMLDivElement>(null)
  const ready = range.checkIn && range.checkOut

  const key = state.status === 'error' ? `${idempotencyKey}-${state.submissionId ?? 0}` : idempotencyKey
  // The live quote, and the dates in the URL (so a chosen stay can be shared, and survives a sign-in).
  useEffect(() => {
    const url = new URL(window.location.href)
    for (const [name, value] of [['checkin', range.checkIn], ['checkout', range.checkOut]] as const) {
      if (value) url.searchParams.set(name, value)
      else url.searchParams.delete(name)
    }
    url.searchParams.set('guests', String(guests))
    window.history.replaceState(window.history.state, '', url)

    if (!range.checkIn || !range.checkOut) return
    const requestKey = `${range.checkIn}|${range.checkOut}|${guests}`
    const controller = new AbortController()
    fetch(`/api/listings/${listing.id}/quote?checkin=${range.checkIn}&checkout=${range.checkOut}&guests=${guests}`, { signal: controller.signal })
      .then((res) => res.json() as Promise<{ ok: true; quote: Quote } | { ok: false; problem: string }>)
      .then((answer) => setFetched({ key: requestKey, state: answer.ok ? { status: 'ready', quote: answer.quote } : { status: 'problem', problem: answer.problem } }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setFetched({ key: requestKey, state: { status: 'problem', problem: 'We couldn’t get a price just now. Check your connection and try again.' } })
      })
    return () => controller.abort()
  }, [range.checkIn, range.checkOut, guests, listing.id])

  const currentKey = range.checkIn && range.checkOut ? `${range.checkIn}|${range.checkOut}|${guests}` : null
  const quote: QuoteState = !currentKey ? { status: 'idle' } : fetched?.key === currentKey ? fetched.state : { status: 'loading' }

  const total = quote.status === 'ready' ? quote.quote.totalKobo : null

  return (
    <>
      <div ref={panel} id="book" className="panel scroll-mt-4 p-5">
        <p className="text-2xl font-semibold figures">
          {formatPrice(listing.nightlyKobo)} <span className="text-base font-normal text-muted">a night</span>
        </p>

        {state.status === 'error' ? (
          <div className="mt-4">
            <ErrorSummary state={state} labels={{ checkIn: 'Dates', guests: 'Guests' }} />
          </div>
        ) : null}

        <div className="mt-4">
          <DatePicker {...availability} value={range} onChange={setRange} />
        </div>

        <div className="mt-4">
          <label htmlFor="guests" className="mb-1 block font-semibold">Guests</label>
          <select id="guests" value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="field min-h-12 w-full px-3">
            {Array.from({ length: listing.maxGuests }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n} guest{n === 1 ? '' : 's'}</option>
            ))}
          </select>
        </div>

        {/* The quote, announced when it changes. */}
        <div aria-live="polite" className="mt-4">
          {quote.status === 'loading' ? <p className="skeleton h-24 w-full" aria-label="Working out the price" /> : null}
          {quote.status === 'problem' ? <p className="rounded-control border-l-4 border-danger bg-card p-3 font-semibold">{quote.problem}</p> : null}
          {quote.status === 'ready' ? <Breakdown quote={quote.quote} /> : null}
          {quote.status === 'idle' ? <p className="text-sm text-muted">Choose your dates to see the total for your stay.</p> : null}
        </div>

        {isOwn ? (
          <p className="mt-4 text-sm text-muted">This is your listing, so you can’t book it. <Link href="/host/listings" className="link">Manage it</Link>.</p>
        ) : (
          <form id="reserve-form" action={action} className="mt-4">
            <input type="hidden" name="listingId" value={listing.id} />
            <input type="hidden" name="checkIn" value={range.checkIn ?? ''} />
            <input type="hidden" name="checkOut" value={range.checkOut ?? ''} />
            <input type="hidden" name="guests" value={guests} />
            <input type="hidden" name="idempotencyKey" value={key} />
            <SubmitButton variant="large" className="w-full" disabled={quote.status !== 'ready'} pendingLabel="Holding your dates…" describedBy="reserve-hint">
              {signedIn ? 'Reserve' : 'Sign in to reserve'}
            </SubmitButton>
            <p id="reserve-hint" className="mt-2 text-center text-sm text-muted">
              {quote.status === 'ready'
                ? `We hold these nights for ${HOLD_MINUTES} minutes while you pay with Paystack.`
                : 'Choose available dates first.'}
            </p>
          </form>
        )}
      </div>

      {/* THE PHONE'S BOOKING BAR: the total and Reserve, always under the thumb. */}
      {!isOwn ? (
        <div className="fixed inset-x-0 bottom-0 z-[400] border-t border-rule bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-pop lg:hidden">
          <div className="mx-auto flex max-w-page items-center justify-between gap-3">
            <div className="min-w-0">
              {total !== null && ready ? (
                <>
                  <p className="tag-sand inline-block px-2.5 py-0.5 text-sm">Total {formatNaira(total)}</p>
                  <p className="truncate text-xs text-muted">{formatRange(range.checkIn!, range.checkOut!)}</p>
                </>
              ) : (
                <p className="text-sm font-semibold">{formatPrice(listing.nightlyKobo)} a night · add dates</p>
              )}
            </div>
            {quote.status === 'ready' ? (
              <button type="submit" form="reserve-form" className={button.primary}>
                {signedIn ? 'Reserve' : 'Sign in'}
              </button>
            ) : (
              <button
                type="button"
                className={button.primary}
                onClick={() => {
                  panel.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
                  panel.current?.querySelector<HTMLButtonElement>('[data-date][tabindex="0"]')?.focus({ preventScroll: true })
                }}
              >
                Choose dates
              </button>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}

/** The line-by-line price, with the Total in the sand pill. */
function Breakdown({ quote }: { quote: Quote }) {
  return (
    <dl className="figures space-y-1.5 text-[0.95rem]">
      {summariseNights(quote.nights).map((g) => (
        <div key={`${g.label}-${g.kobo}`} className="flex justify-between gap-3">
          <dt>
            {g.count} {g.label.toLowerCase()} night{g.count === 1 ? '' : 's'} × {formatPrice(g.kobo)}
          </dt>
          <dd>{formatNaira(g.totalKobo)}</dd>
        </div>
      ))}
      {quote.discountKobo > 0 ? (
        <div className="flex justify-between gap-3 text-success">
          <dt>{quote.discountPercent}% weekly discount</dt>
          <dd>−{formatNaira(quote.discountKobo)}</dd>
        </div>
      ) : null}
      {quote.cleaningFeeKobo > 0 ? (
        <div className="flex justify-between gap-3">
          <dt>Cleaning fee</dt>
          <dd>{formatNaira(quote.cleaningFeeKobo)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between gap-3">
        <dt>Service fee (5%)</dt>
        <dd>{formatNaira(quote.serviceFeeKobo)}</dd>
      </div>
      {quote.cautionDepositKobo > 0 ? (
        <div className="flex justify-between gap-3">
          <dt>Caution deposit <span className="text-muted">(refundable)</span></dt>
          <dd>{formatNaira(quote.cautionDepositKobo)}</dd>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 border-t border-rule pt-2.5">
        <dt className="font-bold">Total for {quote.nightCount} night{quote.nightCount === 1 ? '' : 's'}</dt>
        <dd className="tag-sand px-3 py-1 text-base">{formatNaira(quote.totalKobo)}</dd>
      </div>
    </dl>
  )
}
