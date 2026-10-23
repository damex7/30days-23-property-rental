import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { ActionButton } from '@/components/forms/action-button'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Flash } from '@/components/ui/flash'
import { Icon } from '@/components/ui/icon'
import { PageHeader } from '@/components/ui/page-header'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/money'
import { LISTING_STATUS_LABELS, type ListingStatus } from '@/lib/options'
import { firstValues } from '@/lib/schemas'
import { listMyListings } from '@/lib/services/listings'
import { requireHostPageActor } from '@/lib/services/session-actor'
import { archiveListingAction, deleteDraftAction, pauseListingAction } from '../actions'

export const metadata: Metadata = { title: 'Your listings' }

const BADGE: Record<ListingStatus, string> = {
  draft: 'bg-sunken text-ink',
  pending_review: 'tag-sand',
  published: 'bg-primary text-on-primary',
  paused: 'bg-sunken text-muted',
  rejected: 'border border-danger text-danger',
  archived: 'bg-sunken text-muted line-through',
}

export default function HostListingsPage({ searchParams }: PageProps<'/host/listings'>) {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-8 sm:px-6">
      <PageHeader
        back={{ href: '/host', label: 'Host dashboard' }}
        title="Your listings"
        actions={
          <Link href="/host/listings/new" className={button.primary}>
            <Icon name="plus" />
            Add a listing
          </Link>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <Listings searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Listings({ searchParams }: Pick<PageProps<'/host/listings'>, 'searchParams'>) {
  const actor = await requireHostPageActor()
  const notice = firstValues(await searchParams).notice
  const listings = await listMyListings(actor)
  return (
    <>
      <Flash message={notice === 'submitted' ? 'Sent for review. We’ll email you as soon as it’s checked.' : null} />
      {listings.length === 0 ? (
        <EmptyState title="No listings yet" actions={<Link href="/host/listings/new" className={button.primary}>Add your first place</Link>}>
          <p>It takes about ten minutes: the basics, a pin on the map, a few photos and your prices.</p>
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {listings.map((l) => (
            <li key={l.id} className="panel flex flex-col gap-4 p-4 sm:flex-row">
              <div className="relative aspect-[3/2] w-full shrink-0 overflow-hidden rounded-control bg-sunken sm:w-44">
                {l.coverUrl ? <Image src={l.coverUrl} alt={l.coverAlt ?? ''} fill sizes="176px" className="object-cover" /> : <span className="grid h-full place-items-center text-sm text-muted">No photo yet</span>}
              </div>
              <div className="min-w-0 flex-1">
                <span className={cn('inline-block rounded-pill px-2.5 py-0.5 text-xs font-bold', BADGE[l.status])}>{LISTING_STATUS_LABELS[l.status]}</span>
                <h2 className="mt-1 font-sans text-lg font-semibold">{l.title}</h2>
                <p className="text-sm text-muted">
                  {l.area ? `${l.area}, ${l.city}` : 'Location not set'} · {l.nightlyKobo !== null ? `${formatPrice(l.nightlyKobo)} a night` : 'No price yet'} · {l.photoCount} photo{l.photoCount === 1 ? '' : 's'}
                </p>
                {l.status === 'rejected' && l.rejectionReason ? <p className="mt-1 text-sm"><strong>Reviewer:</strong> {l.rejectionReason}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {l.status !== 'archived' ? <Link href={`/host/listings/${l.id}/edit`} className={button.small}>Edit</Link> : null}
                  {l.status !== 'draft' && l.status !== 'archived' ? <Link href={`/host/listings/${l.id}/calendar`} className={button.small}>Calendar</Link> : null}
                  {l.status === 'published' ? <Link href={`/stays/${l.slug}`} className={button.small}>View</Link> : null}
                  {l.status === 'published' || l.status === 'paused' ? (
                    <ActionButton action={pauseListingAction} fields={{ id: l.id, paused: String(l.status === 'published') }} pendingLabel="Saving…">
                      {l.status === 'published' ? 'Pause' : 'Publish again'}
                    </ActionButton>
                  ) : null}
                  {l.status === 'draft' ? (
                    <ConfirmAction action={deleteDraftAction} archiveAction={archiveListingAction} fields={{ id: l.id }} trigger="Delete draft" title="Delete this draft?" body={<p>The draft and its photos are deleted for good.</p>} confirmLabel="Delete draft" pendingLabel="Deleting…" danger />
                  ) : l.status !== 'archived' ? (
                    <ConfirmAction action={archiveListingAction} fields={{ id: l.id }} trigger="Archive" title="Archive this listing?" body={<p>It disappears from search for good. Past guests keep their trips and reviews. Listings with bookings are never deleted.</p>} confirmLabel="Archive" pendingLabel="Archiving…" danger />
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
