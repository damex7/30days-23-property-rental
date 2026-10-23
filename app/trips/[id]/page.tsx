import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { HoldStatus } from '@/components/trips/hold-status'
import { ReviewForm } from '@/components/trips/review-form'
import { StatusBadge } from '@/components/trips/status-badge'
import { button } from '@/components/ui/button'
import { Flash } from '@/components/ui/flash'
import { Notice } from '@/components/ui/notice'
import { PageHeader } from '@/components/ui/page-header'
import { formatClock } from '@/lib/format'
import { formatNaira, formatPrice } from '@/lib/money'
import { POLICY_LABELS } from '@/lib/options'
import { summariseNights } from '@/lib/pricing'
import { firstValues } from '@/lib/schemas'
import { getMyTrip, previewCancellation } from '@/lib/services/bookings'
import { isServiceError } from '@/lib/services/errors'
import { requirePageActor } from '@/lib/services/session-actor'
import { formatLong, formatStamp } from '@/lib/time'
import { cancelTripAction, reviewAction } from '../actions'

export const metadata: Metadata = { title: 'Your trip' }

const NOTICES: Record<string, string> = {
  booked: 'Payment received. You’re booked! The address and check-in details are below, and we’ve emailed them to you.',
  'payment-failed': 'The payment didn’t go through. You can try again while the hold lasts.',
  'payment-unhonoured': 'We received a payment we couldn’t match to these nights. It has been recorded for a full refund.',
}

export default function TripPage({ params, searchParams }: PageProps<'/trips/[id]'>) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Suspense fallback={<PageSkeleton />}>
        <Trip params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Trip({ params, searchParams }: PageProps<'/trips/[id]'>) {
  const actor = await requirePageActor()
  const { id } = await params
  const notice = firstValues(await searchParams).notice
  let trip
  try {
    trip = await getMyTrip(actor, id)
  } catch (error) {
    // Not yours and not real look the same (proxy.ts already sent a 404 status).
    if (isServiceError(error) && error.kind === 'not_found') notFound()
    throw error
  }
  const preview = previewCancellation(trip)
  const paidRefunds = trip.refunds.reduce((sum, r) => sum + r.amountKobo, 0)

  return (
    <>
      <PageHeader back={{ href: '/trips', label: 'All trips' }} title={trip.listingTitle} description={`${trip.listingArea}, ${trip.listingCity}`} actions={<StatusBadge status={trip.status} />} />
      <Flash message={notice ? (NOTICES[notice] ?? null) : null} />

      <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <section aria-labelledby="when" className="panel p-5">
            <h2 id="when" className="text-xl">Your stay</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="rubric">Check in</dt>
                <dd className="font-semibold">{formatLong(trip.checkIn)}, from {formatClock(trip.checkInTime)}</dd>
              </div>
              <div>
                <dt className="rubric">Check out</dt>
                <dd className="font-semibold">{formatLong(trip.checkOut)}, by {formatClock(trip.checkOutTime)}</dd>
              </div>
              <div>
                <dt className="rubric">Guests</dt>
                <dd>{trip.guestsCount}</dd>
              </div>
              <div>
                <dt className="rubric">Host</dt>
                <dd>{trip.hostFirstName}</dd>
              </div>
            </dl>
            {trip.status === 'held' && trip.holdExpiresAt ? (
              <div className="mt-4 rounded-control border border-sand bg-sunken p-4">
                <HoldStatus expiresAt={trip.holdExpiresAt.toISOString()} />
                <p className="mt-1 text-sm text-muted">These nights are held for you while you pay. If the time runs out, they’re released for other guests.</p>
                {trip.authorizationUrl ? (
                  <a href={trip.authorizationUrl} className={`${button.primary} mt-3`}>Pay {formatNaira(trip.totalKobo ?? 0)} with Paystack</a>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* PRIVATE DETAILS: the SQL returns them only for a confirmed (or completed) stay. */}
          {trip.addressLine ? (
            <section aria-labelledby="arrival" className="panel p-5">
              <h2 id="arrival" className="text-xl">Arrival</h2>
              <p className="mt-2 font-semibold">{trip.addressLine}</p>
              {trip.exactLat && trip.exactLng ? (
                <a className="link text-sm" href={`https://www.openstreetmap.org/?mlat=${trip.exactLat}&mlon=${trip.exactLng}#map=17/${trip.exactLat}/${trip.exactLng}`}>
                  Open the exact location in OpenStreetMap
                </a>
              ) : null}
              {trip.hostPhone ? <p className="mt-3">Call {trip.hostFirstName}: <a href={`tel:${trip.hostPhone}`} className="link">{trip.hostPhone}</a></p> : null}
              {trip.checkinInstructions ? <p className="mt-3 whitespace-pre-line rounded-control bg-sunken p-3">{trip.checkinInstructions}</p> : null}
            </section>
          ) : trip.status === 'held' ? (
            <Notice tone="info" title="The address comes with the confirmation">
              <p>Once your payment is confirmed, the exact address, the host’s phone number and the check-in instructions appear here.</p>
            </Notice>
          ) : null}

          {trip.status === 'completed' ? (
            <section id="review" aria-labelledby="review-title" className="panel scroll-mt-4 p-5">
              <h2 id="review-title" className="text-xl">{trip.hasReview ? 'Thanks for your review' : 'How was your stay?'}</h2>
              {trip.hasReview ? (
                <p className="mt-2 text-muted">It’s on the <Link href={`/stays/${trip.listingSlug}#reviews`} className="link">listing page</Link>.</p>
              ) : (
                <ReviewForm action={reviewAction} stayId={trip.id} />
              )}
            </section>
          ) : null}
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="price" className="panel p-5">
            <h2 id="price" className="text-xl">Price</h2>
            <dl className="figures mt-3 space-y-1.5 text-[0.95rem]">
              {summariseNights(trip.priceLines ?? []).map((g) => (
                <div key={`${g.label}-${g.kobo}`} className="flex justify-between gap-3">
                  <dt>{g.count} {g.label.toLowerCase()} × {formatPrice(g.kobo)}</dt>
                  <dd>{formatNaira(g.totalKobo)}</dd>
                </div>
              ))}
              {trip.discountKobo ? <div className="flex justify-between gap-3"><dt>Weekly discount</dt><dd>−{formatNaira(trip.discountKobo)}</dd></div> : null}
              {trip.cleaningFeeKobo ? <div className="flex justify-between gap-3"><dt>Cleaning fee</dt><dd>{formatNaira(trip.cleaningFeeKobo)}</dd></div> : null}
              <div className="flex justify-between gap-3"><dt>Service fee</dt><dd>{formatNaira(trip.serviceFeeKobo ?? 0)}</dd></div>
              {trip.cautionDepositKobo ? <div className="flex justify-between gap-3"><dt>Caution deposit</dt><dd>{formatNaira(trip.cautionDepositKobo)}</dd></div> : null}
              <div className="flex items-center justify-between gap-3 border-t border-rule pt-2">
                <dt className="font-bold">Total</dt>
                <dd className="tag-sand px-3 py-0.5">{formatNaira(trip.totalKobo ?? 0)}</dd>
              </div>
            </dl>
            {trip.refunds.length ? (
              <p className="mt-3 text-sm">
                Refund recorded: <strong className="figures">{formatNaira(paidRefunds)}</strong> ({trip.refunds.map((r) => r.status).join(', ')}).
              </p>
            ) : null}
          </section>

          {preview.allowed ? (
            <section aria-labelledby="cancel" className="panel p-5">
              <h2 id="cancel" className="text-xl">Cancel</h2>
              <p className="mt-1 text-sm text-muted">{POLICY_LABELS[trip.cancellationPolicy ?? 'strict'].name} policy: {POLICY_LABELS[trip.cancellationPolicy ?? 'strict'].summary}</p>
              <p className="mt-2 text-sm">
                If you cancel now: <strong className="figures">{formatNaira(preview.refundKobo)}</strong> back.
                {preview.deadline ? ` This applies until ${formatStamp(preview.deadline)}.` : ''}
              </p>
              <div className="mt-3">
                <ConfirmAction
                  action={cancelTripAction}
                  fields={{ id: trip.id }}
                  trigger="Cancel this booking"
                  triggerVariant="secondary"
                  title="Cancel this booking?"
                  body={
                    <div className="space-y-2">
                      <p>{preview.explanation}</p>
                      <dl className="figures rounded-control bg-sunken p-3 text-sm">
                        <div className="flex justify-between"><dt>Stay amount refunded ({preview.percent}%)</dt><dd>{formatNaira(preview.stayRefundKobo)}</dd></div>
                        <div className="flex justify-between"><dt>Caution deposit</dt><dd>{formatNaira(preview.depositRefundKobo)}</dd></div>
                        <div className="flex justify-between border-t border-rule pt-1 font-bold"><dt>You get back</dt><dd>{formatNaira(preview.refundKobo)}</dd></div>
                      </dl>
                      <p className="text-sm">The nights are released at once. Refunds are recorded now and paid out by Staybook.</p>
                    </div>
                  }
                  confirmLabel="Yes, cancel it"
                  pendingLabel="Cancelling…"
                  danger
                />
              </div>
            </section>
          ) : null}
          <p className="text-xs text-muted">Booked {formatStamp(trip.createdAt)} · Reference {trip.paystackReference}</p>
        </aside>
      </div>
    </>
  )
}
