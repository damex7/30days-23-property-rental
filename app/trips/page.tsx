import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { StatusBadge } from '@/components/trips/status-badge'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Flash } from '@/components/ui/flash'
import { PageHeader } from '@/components/ui/page-header'
import { formatNaira } from '@/lib/money'
import type { StayDetail } from '@/lib/repos/stays'
import { firstValues } from '@/lib/schemas'
import { listMyTrips } from '@/lib/services/bookings'
import { requirePageActor } from '@/lib/services/session-actor'
import { formatRange, todayInLagos } from '@/lib/time'

export const metadata: Metadata = { title: 'Your trips' }

const NOTICES: Record<string, string> = {
  demo: 'Welcome! You’re a demo guest with one upcoming trip and one past stay waiting for your review.',
  'payment-pending': 'We’re still waiting to hear from Paystack. This page will show the booking as confirmed as soon as the payment arrives.',
}

export default function TripsPage({ searchParams }: PageProps<'/trips'>) {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-8 sm:px-6">
      <PageHeader title="Your trips" description="Upcoming stays first. The exact address and check-in instructions appear here once a booking is confirmed." />
      <Suspense fallback={<PageSkeleton />}>
        <Trips searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Trips({ searchParams }: Pick<PageProps<'/trips'>, 'searchParams'>) {
  const actor = await requirePageActor()
  const notice = firstValues(await searchParams).notice
  const trips = await listMyTrips(actor)
  const today = todayInLagos()
  const upcoming = trips.filter((t) => t.checkOut >= today && (t.status === 'held' || t.status === 'confirmed')).reverse()
  const past = trips.filter((t) => !upcoming.includes(t))
  return (
    <>
      <Flash message={notice ? (NOTICES[notice] ?? null) : null} tone="info" />
      {trips.length === 0 ? (
        <EmptyState title="No trips yet" actions={<Link href="/stays" className={button.primary}>Find a stay</Link>}>
          <p>When you book a place, it appears here with everything you need for arrival.</p>
        </EmptyState>
      ) : (
        <div className="space-y-10">
          <section aria-labelledby="upcoming">
            <h2 id="upcoming" className="mb-3 text-2xl">Upcoming</h2>
            {upcoming.length ? <TripList trips={upcoming} /> : <p className="text-muted">Nothing booked ahead. <Link href="/stays" className="link">Find your next stay</Link>.</p>}
          </section>
          {past.length ? (
            <section aria-labelledby="past">
              <h2 id="past" className="mb-3 text-2xl">Past and cancelled</h2>
              <TripList trips={past} />
            </section>
          ) : null}
        </div>
      )}
    </>
  )
}

function TripList({ trips }: { trips: StayDetail[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {trips.map((t) => (
        <li key={t.id} className="panel flex gap-4 overflow-hidden p-3">
          <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-control bg-sunken">
            {t.coverUrl ? <Image src={t.coverUrl} alt={t.coverAlt ?? ''} fill sizes="128px" className="object-cover" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <StatusBadge status={t.status} />
            <h3 className="mt-1 truncate font-sans text-base font-semibold">
              <Link href={`/trips/${t.id}`} className="text-ink no-underline hover:underline">{t.listingTitle}</Link>
            </h3>
            <p className="text-sm text-muted">{t.listingArea}, {t.listingCity} · {formatRange(t.checkIn, t.checkOut)}</p>
            <p className="figures text-sm">{formatNaira(t.totalKobo ?? 0)}</p>
            {t.status === 'completed' && !t.hasReview ? <Link href={`/trips/${t.id}#review`} className="text-sm font-semibold text-primary underline">Leave a review</Link> : null}
          </div>
        </li>
      ))}
    </ul>
  )
}
