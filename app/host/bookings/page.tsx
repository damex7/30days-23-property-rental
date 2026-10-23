import type { Metadata } from 'next'
import { Suspense } from 'react'
import { TableSkeleton } from '@/components/site/page-skeleton'
import { StatusBadge } from '@/components/trips/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { formatNaira } from '@/lib/money'
import { listBookingsForMyListings } from '@/lib/services/bookings'
import { requireHostPageActor } from '@/lib/services/session-actor'
import { formatRange } from '@/lib/time'

export const metadata: Metadata = { title: 'Bookings' }

/** Bookings on MY listings only (WHERE host_id = me in the SQL). */
export default function HostBookingsPage() {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-8 sm:px-6">
      <PageHeader back={{ href: '/host', label: 'Host dashboard' }} title="Bookings" description="Upcoming first. The guest’s total includes the 5% service fee and the refundable caution deposit." />
      <Suspense fallback={<TableSkeleton />}>
        <Bookings />
      </Suspense>
    </div>
  )
}

async function Bookings() {
  const actor = await requireHostPageActor()
  const bookings = await listBookingsForMyListings(actor)
  if (bookings.length === 0) return <EmptyState title="No bookings yet"><p>When guests book your places, they appear here.</p></EmptyState>
  return (
    <div className="overflow-x-auto rounded-card border border-rule bg-card">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">Bookings on your listings</caption>
        <thead className="bg-sunken">
          <tr>
            <th scope="col" className="px-3 py-2.5">Guest</th>
            <th scope="col" className="px-3 py-2.5">Listing</th>
            <th scope="col" className="px-3 py-2.5">Dates</th>
            <th scope="col" className="px-3 py-2.5">Status</th>
            <th scope="col" className="px-3 py-2.5 text-right">Guest paid</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id} className="border-t border-rule">
              <td className="px-3 py-2.5 font-semibold">{b.guestName}<span className="block font-normal text-muted">{b.guestsCount} guest{b.guestsCount === 1 ? '' : 's'}</span></td>
              <td className="px-3 py-2.5">{b.listingTitle}</td>
              <td className="px-3 py-2.5">{formatRange(b.checkIn, b.checkOut)}<span className="block text-muted">{b.nightsCount} nights</span></td>
              <td className="px-3 py-2.5"><StatusBadge status={b.status} /></td>
              <td className="px-3 py-2.5 text-right figures">{formatNaira(b.totalKobo ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
