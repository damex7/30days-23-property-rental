import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ActionButton } from '@/components/forms/action-button'
import { HostCalendar } from '@/components/host/host-calendar'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { PageHeader } from '@/components/ui/page-header'
import { appUrl } from '@/lib/auth/email'
import { formatPrice } from '@/lib/money'
import { firstValues } from '@/lib/schemas'
import { getCalendar, icalUrlFor } from '@/lib/services/calendar'
import { isServiceError } from '@/lib/services/errors'
import { requireHostPageActor } from '@/lib/services/session-actor'
import { addMonths, formatMonth, formatRange, ISO_MONTH, todayInLagos } from '@/lib/time'
import { removePriceRuleAction, resetIcalAction } from '../../../actions'

export const metadata: Metadata = { title: 'Calendar' }

export default function CalendarPage({ params, searchParams }: PageProps<'/host/listings/[id]/calendar'>) {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-8 sm:px-6">
      <Suspense fallback={<PageSkeleton />}>
        <Calendar params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Calendar({ params, searchParams }: PageProps<'/host/listings/[id]/calendar'>) {
  const actor = await requireHostPageActor()
  const { id } = await params
  const query = firstValues(await searchParams)
  const month = query.month && ISO_MONTH.test(query.month) ? query.month : todayInLagos().slice(0, 7)
  let data
  try {
    data = await getCalendar(actor, id, month)
  } catch (error) {
    if (isServiceError(error) && error.kind === 'not_found') notFound()
    throw error
  }
  let feed: string | null = null
  try {
    feed = appUrl(await icalUrlFor(actor, id))
  } catch {
    feed = null // ICAL_SIGNING_SECRET not set yet
  }

  return (
    <>
      <PageHeader back={{ href: '/host/listings', label: 'Your listings' }} title={`Calendar: ${data.listing.title}`} description="Block nights you don’t want booked, or set a special price. Bookings and blocks share one table, so neither can ever overlap the other." />
      <nav aria-label="Months" className="mb-4 flex items-center justify-between gap-2">
        <Link href={`?month=${addMonths(month, -1)}`} className={button.secondary}><Icon name="chevronLeft" />{formatMonth(addMonths(month, -1))}</Link>
        <h2 className="text-2xl" aria-live="polite">{formatMonth(month)}</h2>
        <Link href={`?month=${addMonths(month, 1)}`} className={button.secondary}>{formatMonth(addMonths(month, 1))}<Icon name="chevronRight" /></Link>
      </nav>
      <HostCalendar key={month} listingId={data.listing.id} month={month} today={data.today} stays={data.stays} rules={data.rules} nightlyKobo={data.listing.nightlyKobo} readOnly={actor.isDemo} />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="rules" className="panel p-5">
          <h2 id="rules" className="text-xl">Special prices</h2>
          {data.rules.length === 0 ? <p className="mt-2 text-muted">None. Select nights above to add one.</p> : (
            <ul className="mt-3 divide-y divide-rule">
              {data.rules.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><strong>{r.label}</strong> · {formatRange(r.start, r.end)} · <span className="figures">{formatPrice(r.nightlyKobo)}</span></span>
                  {!actor.isDemo ? <ActionButton action={removePriceRuleAction} fields={{ id: data.listing.id, ruleId: r.id }} pendingLabel="Removing…">Remove</ActionButton> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="ical" className="panel p-5">
          <h2 id="ical" className="text-xl">Sync with other calendars</h2>
          <p className="mt-1 text-sm text-muted">Paste this link into another booking site or Google Calendar to show these nights as busy there. It contains a secret: anyone with it can see when the flat is free, so keep it private.</p>
          {feed ? (
            <>
              <label htmlFor="ical-url" className="mt-3 block text-sm font-semibold">Calendar link (.ics)</label>
              <input id="ical-url" readOnly value={feed} className="field mt-1 min-h-11 w-full px-3 text-sm" />
              {!actor.isDemo ? <div className="mt-3"><ActionButton action={resetIcalAction} fields={{ id: data.listing.id }} pendingLabel="Resetting…">Reset the link</ActionButton></div> : null}
            </>
          ) : (
            <p className="mt-3 text-sm">Set ICAL_SIGNING_SECRET to turn calendar links on.</p>
          )}
        </section>
      </div>
    </>
  )
}
