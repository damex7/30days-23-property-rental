import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { Gallery } from '@/components/stays/gallery'
import { PageHeader } from '@/components/ui/page-header'
import { formatNaira } from '@/lib/money'
import { LISTING_STATUS_LABELS, POLICY_LABELS, PROPERTY_TYPE_LABELS } from '@/lib/options'
import { getListingForReview } from '@/lib/services/admin'
import { isServiceError } from '@/lib/services/errors'
import { requireAdminActor } from '@/lib/services/session-actor'

export const metadata: Metadata = { title: 'Review listing' }

/** Everything about a listing the admin needs to decide, including the private address (admins may see it). */
export default function ReviewListingPage({ params }: PageProps<'/admin/listings/[id]'>) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Suspense fallback={<PageSkeleton />}>
        <Review params={params} />
      </Suspense>
    </div>
  )
}

async function Review({ params }: Pick<PageProps<'/admin/listings/[id]'>, 'params'>) {
  const actor = await requireAdminActor()
  const { id } = await params
  let review
  try {
    review = await getListingForReview(actor, id)
  } catch (error) {
    if (isServiceError(error) && error.kind === 'not_found') notFound()
    throw error
  }
  const { listing, photos } = review
  return (
    <>
      <PageHeader back={{ href: '/admin', label: 'Admin' }} title={listing.title} description={`${LISTING_STATUS_LABELS[listing.status]} · ${PROPERTY_TYPE_LABELS[listing.propertyType]} in ${listing.area}, ${listing.city}`} />
      <Gallery photos={photos} title={listing.title} />
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="panel p-4"><dt className="rubric">Address (private)</dt><dd>{listing.addressLine}</dd><dd className="text-sm text-muted figures">{listing.lat}, {listing.lng}</dd></div>
        <div className="panel p-4"><dt className="rubric">Prices</dt><dd className="figures">{listing.nightlyKobo !== null ? formatNaira(listing.nightlyKobo) : '—'} a night{listing.weekendKobo ? `, ${formatNaira(listing.weekendKobo)} Fri/Sat` : ''}</dd><dd className="text-sm text-muted">Cleaning {formatNaira(listing.cleaningFeeKobo)} · deposit {formatNaira(listing.cautionDepositKobo)} · {listing.weeklyDiscountPercent}% weekly</dd></div>
        <div className="panel p-4"><dt className="rubric">Policy</dt><dd>{POLICY_LABELS[listing.cancellationPolicy].name}: {POLICY_LABELS[listing.cancellationPolicy].summary}</dd></div>
        <div className="panel p-4"><dt className="rubric">Amenities</dt><dd>{listing.amenities.join(', ') || 'None'}</dd></div>
      </dl>
      <section className="mt-6 panel p-5">
        <h2 className="text-xl">Description</h2>
        <p className="mt-2 whitespace-pre-line">{listing.description}</p>
        <h2 className="mt-5 text-xl">House rules</h2>
        <p className="mt-2 whitespace-pre-line">{listing.houseRules || '—'}</p>
      </section>
    </>
  )
}
