import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { BasicsForm, LocationForm, PricingForm, RulesForm, SubmitForm } from '@/components/host/listing-forms'
import { PhotoManager } from '@/components/host/photo-manager'
import { StepNav } from '@/components/host/step-nav'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { Flash } from '@/components/ui/flash'
import { Notice } from '@/components/ui/notice'
import { PageHeader } from '@/components/ui/page-header'
import { formatNaira } from '@/lib/money'
import { LISTING_STATUS_LABELS } from '@/lib/options'
import { firstValues, LISTING_STEPS, STEP_LABELS, type ListingStep } from '@/lib/schemas'
import { DEMO_READ_ONLY_MESSAGE } from '@/lib/services/actor'
import { isServiceError } from '@/lib/services/errors'
import { getMyListing, listAmenities, missingForReview } from '@/lib/services/listings'
import { listMyPhotos } from '@/lib/services/photos'
import { requireHostPageActor } from '@/lib/services/session-actor'
import { saveBasicsAction, saveLocationAction, savePricingAction, saveRulesAction, submitListingAction } from '../../../actions'

export const metadata: Metadata = { title: 'Edit listing' }

const NOTICES: Record<string, string> = { saved: 'Saved.', draft: 'Draft created. Next, where is it?' }

export default function EditListingPage({ params, searchParams }: PageProps<'/host/listings/[id]/edit'>) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Suspense fallback={<PageSkeleton />}>
        <Edit params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Edit({ params, searchParams }: PageProps<'/host/listings/[id]/edit'>) {
  const actor = await requireHostPageActor()
  const { id } = await params
  const query = firstValues(await searchParams)
  const step: ListingStep = (LISTING_STEPS as readonly string[]).includes(query.step ?? '') ? (query.step as ListingStep) : 'basics'
  let listing
  try {
    listing = await getMyListing(actor, id)
  } catch (error) {
    if (isServiceError(error) && error.kind === 'not_found') notFound()
    throw error
  }
  const [amenities, photos] = await Promise.all([listAmenities(actor), listMyPhotos(actor, id)])
  const missing = missingForReview(listing, actor)
  const done: Partial<Record<ListingStep, boolean>> = {
    basics: true,
    location: listing.lat !== null && Boolean(listing.addressLine),
    photos: photos.length >= 3,
    pricing: listing.nightlyKobo !== null,
    rules: listing.amenities.length > 0,
    review: listing.status !== 'draft',
  }

  return (
    <>
      <PageHeader
        back={{ href: '/host/listings', label: 'Your listings' }}
        title={listing.title}
        description={`${LISTING_STATUS_LABELS[listing.status]} · ${STEP_LABELS[step]}`}
        actions={listing.status === 'published' ? <Link href={`/stays/${listing.slug}`} className={button.secondary}>View the public page</Link> : null}
      />
      <StepNav listingId={listing.id} current={step} done={done} />
      <Flash message={query.notice ? (NOTICES[query.notice] ?? null) : null} />
      {actor.isDemo ? <Notice tone="info" title="Read-only demo" className="mb-5"><p>{DEMO_READ_ONLY_MESSAGE}</p></Notice> : null}
      {listing.status === 'rejected' && listing.rejectionReason ? (
        <Notice tone="warning" title="Changes requested by the reviewer" className="mb-5">
          <p>{listing.rejectionReason}</p>
          <p className="mt-1">Make the changes, then send it for review again from the last step.</p>
        </Notice>
      ) : null}

      <section aria-labelledby="step-title" className="panel p-5 sm:p-6">
        <h2 id="step-title" className="mb-4 text-2xl">{STEP_LABELS[step]}</h2>
        {step === 'basics' ? <BasicsForm action={saveBasicsAction} listing={listing} /> : null}
        {step === 'location' ? <LocationForm action={saveLocationAction} listing={listing} /> : null}
        {step === 'photos' ? (
          <>
            <PhotoManager listingId={listing.id} photos={photos} readOnly={actor.isDemo} />
            <div className="mt-6 border-t border-rule pt-5">
              <Link href={`/host/listings/${listing.id}/edit?step=pricing`} className={button.primary}>Continue to pricing</Link>
            </div>
          </>
        ) : null}
        {step === 'pricing' ? <PricingForm action={savePricingAction} listing={listing} /> : null}
        {step === 'rules' ? <RulesForm action={saveRulesAction} listing={listing} amenities={amenities} /> : null}
        {step === 'review' ? (
          <div className="space-y-5">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div><dt className="rubric">Where</dt><dd>{listing.area ? `${listing.area}, ${listing.city}` : 'Not set'}</dd></div>
              <div><dt className="rubric">Nightly</dt><dd className="figures">{listing.nightlyKobo !== null ? formatNaira(listing.nightlyKobo) : 'Not set'}</dd></div>
              <div><dt className="rubric">Photos</dt><dd>{photos.length}</dd></div>
              <div><dt className="rubric">Amenities</dt><dd>{listing.amenities.length}</dd></div>
            </dl>
            {listing.status === 'draft' || listing.status === 'rejected' ? (
              <>
                {missing.length > 0 ? (
                  <Notice tone="warning" title="Before you can send it">
                    <ul className="list-disc pl-4">{missing.map((m) => <li key={m}>Add {m}</li>)}</ul>
                  </Notice>
                ) : (
                  <p>Everything’s here. A person will check the listing, usually within a day, and we’ll email you.</p>
                )}
                <SubmitForm action={submitListingAction} listingId={listing.id} disabled={missing.length > 0 || actor.isDemo} />
              </>
            ) : (
              <p>This listing is <strong>{LISTING_STATUS_LABELS[listing.status].toLowerCase()}</strong>. Edits you make are saved straight away.</p>
            )}
          </div>
        ) : null}
      </section>
    </>
  )
}
