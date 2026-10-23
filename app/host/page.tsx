import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { StatusBadge } from '@/components/trips/status-badge'
import { button } from '@/components/ui/button'
import { Flash } from '@/components/ui/flash'
import { Icon } from '@/components/ui/icon'
import { PageHeader } from '@/components/ui/page-header'
import { formatNaira } from '@/lib/money'
import { firstValues } from '@/lib/schemas'
import { listBookingsForMyListings } from '@/lib/services/bookings'
import { getDashboard } from '@/lib/services/calendar'
import { requireHostPageActor } from '@/lib/services/session-actor'
import { formatRange, relativeDay, todayInLagos } from '@/lib/time'

export const metadata: Metadata = { title: 'Host dashboard' }

export default function HostPage({ searchParams }: PageProps<'/host'>) {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-8 sm:px-6">
      <PageHeader
        title="Host dashboard"
        actions={
          <>
            <Link href="/host/listings" className={button.secondary}>Your listings</Link>
            <Link href="/host/bookings" className={button.secondary}>Bookings</Link>
            <Link href="/host/reviews" className={button.secondary}>Reviews</Link>
          </>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Dashboard({ searchParams }: Pick<PageProps<'/host'>, 'searchParams'>) {
  const actor = await requireHostPageActor()
  const notice = firstValues(await searchParams).notice
  const [{ occupancy, money }, bookings] = await Promise.all([getDashboard(actor), listBookingsForMyListings(actor)])
  const today = todayInLagos()
  const upcoming = bookings.filter((b) => b.status === 'confirmed' && b.checkIn >= today).slice(0, 6)
  const recent = [...bookings].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 6)
  const percent = occupancy.available > 0 ? Math.round((occupancy.booked / occupancy.available) * 100) : 0

  return (
    <>
      <Flash message={notice === 'demo' ? 'You’re looking around as the shared demo host. Everything is read-only, and guests’ names are masked.' : null} tone="info" />
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel p-5">
          <dt className="rubric">Occupancy, {occupancy.month}</dt>
          <dd className="mt-1 font-display text-4xl figures">{percent}%</dd>
          <dd className="text-sm text-muted">{occupancy.booked} of {occupancy.available} open nights booked</dd>
          <dd aria-hidden className="mt-2 h-2 overflow-hidden rounded-pill bg-sunken"><span className="block h-full bg-primary" style={{ width: `${percent}%` }} /></dd>
        </div>
        <div className="panel p-5">
          <dt className="rubric">Earned so far</dt>
          <dd className="mt-1 text-2xl font-semibold figures">{formatNaira(money.allTimeKobo)}</dd>
          <dd className="text-sm text-muted">From completed stays (nights and cleaning)</dd>
        </div>
        <div className="panel p-5">
          <dt className="rubric">This month</dt>
          <dd className="mt-1 text-2xl font-semibold figures">{formatNaira(money.thisMonthKobo)}</dd>
          <dd className="text-sm text-muted">Stays starting this month</dd>
        </div>
        <div className="panel p-5">
          <dt className="rubric">Coming up</dt>
          <dd className="mt-1 text-2xl font-semibold figures">{formatNaira(money.upcomingKobo)}</dd>
          <dd className="text-sm text-muted">Confirmed, not yet stayed</dd>
        </div>
      </dl>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="checkins" className="panel p-5">
          <h2 id="checkins" className="text-2xl">Upcoming check-ins</h2>
          {upcoming.length === 0 ? <p className="mt-2 text-muted">No confirmed arrivals coming up.</p> : (
            <ul className="mt-3 divide-y divide-rule">
              {upcoming.map((b) => (
                <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                  <span>
                    <span className="font-semibold">{b.guestName}</span> · {b.listingTitle}
                  </span>
                  <span className="text-sm text-muted">{formatRange(b.checkIn, b.checkOut)} ({relativeDay(b.checkIn, today)})</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="recent" className="panel p-5">
          <h2 id="recent" className="text-2xl">Recent bookings</h2>
          {recent.length === 0 ? (
            <p className="mt-2 text-muted">No bookings yet. <Link href="/host/listings" className="link">Check your listings are published</Link>.</p>
          ) : (
            <ul className="mt-3 divide-y divide-rule">
              {recent.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0">
                    <span className="font-semibold">{b.guestName}</span> · <span className="text-muted">{b.listingTitle}</span>
                  </span>
                  <span className="flex items-center gap-2"><StatusBadge status={b.status} /><span className="figures text-sm">{formatNaira(b.totalKobo ?? 0)}</span></span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/host/bookings" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary underline">All bookings <Icon name="arrowRight" className="size-4" /></Link>
        </section>
      </div>
    </>
  )
}
