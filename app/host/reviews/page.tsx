import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ReplyForm } from '@/components/host/reply-form'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { listHostReviews } from '@/lib/services/reviews'
import { requireHostPageActor } from '@/lib/services/session-actor'
import { replyAction } from '../actions'

export const metadata: Metadata = { title: 'Reviews' }

export default function HostReviewsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader back={{ href: '/host', label: 'Host dashboard' }} title="Reviews" description="Unanswered reviews first. Your reply appears under the review on the listing page." />
      <Suspense fallback={<PageSkeleton />}>
        <Reviews />
      </Suspense>
    </div>
  )
}

async function Reviews() {
  const actor = await requireHostPageActor()
  const reviews = await listHostReviews(actor)
  if (reviews.length === 0) return <EmptyState title="No reviews yet"><p>Guests can review a stay the day after they check out.</p></EmptyState>
  return (
    <ul className="space-y-4">
      {reviews.map((r) => (
        <li key={r.id} className="panel p-5">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{r.guestFirstName}</span>
            <span className="text-sm text-muted">{r.listingTitle} · {r.stayMonth}</span>
            <span className="figures ml-auto font-bold text-sand-ink">{r.overall}/5</span>
          </p>
          <p className="mt-2">{r.comment}</p>
          {r.hostReply ? (
            <p className="mt-3 border-l-2 border-primary pl-3 text-sm"><span className="font-semibold">Your reply:</span> {r.hostReply}</p>
          ) : actor.isDemo ? null : (
            <ReplyForm action={replyAction} reviewId={r.id} />
          )}
        </li>
      ))}
    </ul>
  )
}
