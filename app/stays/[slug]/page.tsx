import { randomUUID } from 'node:crypto'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { BookingPanel } from '@/components/booking/booking-panel'
import { ApproxMap } from '@/components/map/approx-map'
import { AmenityList } from '@/components/stays/amenity-list'
import { Gallery } from '@/components/stays/gallery'
import { isGuestFavourite, Rating } from '@/components/stays/rating'
import { ReviewsSection } from '@/components/stays/reviews-section'
import { SaveButton } from '@/components/stays/save-button'
import { ListingSkeleton } from '@/components/stays/listing-skeleton'
import { formatPrice } from '@/lib/money'
import { POLICY_LABELS, PROPERTY_TYPE_LABELS } from '@/lib/options'
import { firstValues } from '@/lib/schemas'
import { isServiceError } from '@/lib/services/errors'
import { getAvailability } from '@/lib/services/bookings'
import { isSavedByMe } from '@/lib/services/saved'
import { getPublicListing, listAmenities } from '@/lib/services/listings'
import { listingReviews } from '@/lib/services/reviews'
import { getPageActor } from '@/lib/services/session-actor'
import { formatClock } from '@/lib/format'
import { isValidDate } from '@/lib/time'

export async function generateMetadata({ params }: PageProps<'/stays/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  try {
    const listing = await getPublicListing(null, slug)
    return { title: `${listing.title} · ${listing.area}`, description: listing.description.slice(0, 160) }
  } catch {
    return { title: 'Stay not found' }
  }
}

export default function ListingPage({ params, searchParams }: PageProps<'/stays/[slug]'>) {
  return (
    <Suspense fallback={<ListingSkeleton />}>
      <Listing params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function Listing({ params, searchParams }: PageProps<'/stays/[slug]'>) {
  await connection()
  const { slug } = await params
  const query = firstValues(await searchParams)
  let listing
  try {
    listing = await getPublicListing(null, slug)
  } catch (error) {
    if (isServiceError(error) && error.kind === 'not_found') notFound()
    throw error
  }
  const actor = await getPageActor()
  const [amenities, reviews, availability, saved] = await Promise.all([listAmenities(actor), listingReviews(actor, listing.id), getAvailability(actor, listing.id), isSavedByMe(actor, listing.id)])
  const beds = listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} bedroom${listing.bedrooms === 1 ? '' : 's'}`

  return (
    <div className="mx-auto w-full max-w-page px-4 pt-6 pb-28 sm:px-6 sm:pt-8 lg:pb-10">
      <header className="mb-5">
        <p className="rubric">
          {listing.area} · {listing.city}, {listing.state}
        </p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <h1 className="text-[2rem] sm:text-5xl">{listing.title}</h1>
          <SaveButton listingId={listing.id} saved={saved} title={listing.title} signedIn={Boolean(actor)} />
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
          <Rating avg={listing.ratingAvg} count={listing.ratingCount} />
          {isGuestFavourite(listing.ratingAvg, listing.ratingCount) ? <span className="font-semibold text-sand-ink">Guest favourite</span> : null}
          <span>
            {PROPERTY_TYPE_LABELS[listing.propertyType]} · {beds} · {listing.bathrooms} bathroom{listing.bathrooms === 1 ? '' : 's'} · up to {listing.maxGuests} guest{listing.maxGuests === 1 ? '' : 's'}
          </span>
        </p>
      </header>

      <Gallery photos={listing.photos} title={listing.title} />

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="about">
            <h2 id="about" className="text-2xl">About this place</h2>
            <p className="mt-1 text-sm text-muted">Hosted by {listing.hostFirstName}, on Staybook since {new Date(`${listing.hostSince}T12:00:00Z`).getUTCFullYear()}</p>
            <div className="mt-3 space-y-3 whitespace-pre-line">{listing.description}</div>
          </section>

          <section aria-labelledby="amenities">
            <h2 id="amenities" className="mb-3 text-2xl">What’s here</h2>
            <AmenityList codes={listing.amenities} all={amenities} />
          </section>

          <section aria-labelledby="location">
            <h2 id="location" className="text-2xl">Where you’ll be</h2>
            <p className="mt-1 text-muted">
              {listing.area}, {listing.city}. The exact address and directions are shared after you book.
            </p>
            <div className="mt-3">
              <ApproxMap lat={listing.approxLat} lng={listing.approxLng} area={listing.area} />
            </div>
          </section>

          <section aria-labelledby="rules">
            <h2 id="rules" className="text-2xl">House rules and policies</h2>
            <dl className="mt-3 grid gap-4 sm:grid-cols-3">
              <div className="panel p-4">
                <dt className="rubric">Check in</dt>
                <dd className="mt-1 font-semibold">From {formatClock(listing.checkInTime)}</dd>
              </div>
              <div className="panel p-4">
                <dt className="rubric">Check out</dt>
                <dd className="mt-1 font-semibold">By {formatClock(listing.checkOutTime)}</dd>
              </div>
              <div className="panel p-4">
                <dt className="rubric">Cancellation</dt>
                <dd className="mt-1 font-semibold">{POLICY_LABELS[listing.cancellationPolicy].name}</dd>
                <dd className="text-sm text-muted">{POLICY_LABELS[listing.cancellationPolicy].summary}</dd>
              </div>
            </dl>
            {listing.houseRules ? <p className="mt-4 whitespace-pre-line">{listing.houseRules}</p> : null}
            <p className="mt-3 text-sm text-muted">
              Stays of {listing.minNights === listing.maxNights ? listing.minNights : `${listing.minNights} to ${listing.maxNights}`} nights.
              {listing.cautionDepositKobo > 0 ? ` A refundable caution deposit of ${formatPrice(listing.cautionDepositKobo)} is added to every booking.` : ''}
            </p>
          </section>

          <section aria-labelledby="reviews">
            <h2 id="reviews" className="mb-3 text-2xl">Reviews</h2>
            <ReviewsSection averages={reviews.averages} reviews={reviews.reviews} />
          </section>
        </div>

        <aside aria-label="Book this stay" className="lg:sticky lg:top-6 lg:self-start">
          <BookingPanel
            listing={{ id: listing.id, slug: listing.slug, nightlyKobo: listing.nightlyKobo, maxGuests: listing.maxGuests }}
            availability={availability}
            initial={{
              checkIn: query.checkin && isValidDate(query.checkin) ? query.checkin : null,
              checkOut: query.checkout && isValidDate(query.checkout) ? query.checkout : null,
              guests: Number.parseInt(query.guests ?? '1', 10) || 1,
            }}
            signedIn={Boolean(actor)}
            isOwn={actor?.id === listing.hostId}
            idempotencyKey={randomUUID()}
          />
        </aside>
      </div>
    </div>
  )
}
