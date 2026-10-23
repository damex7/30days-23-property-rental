import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { formatPrice } from '@/lib/money'
import { PROPERTY_TYPE_LABELS } from '@/lib/options'
import type { Quote } from '@/lib/pricing'
import type { PublicCard } from '@/lib/repos/listings'
import { isGuestFavourite, Rating } from './rating'

/**
 * A result card. With dates chosen it shows the TOTAL for those nights
 * (weekend prices and the weekly discount included, from lib/pricing.ts) in
 * the sand price tag, and the nightly price underneath; without dates, the
 * nightly price. The whole card is one link (the title), with the heart as
 * a separate button beside it, so keyboard users get two clear stops.
 */
export function StayCard({ card, quote, href, heart, priority = false }: { card: PublicCard; quote?: Quote | null; href: string; heart?: ReactNode; priority?: boolean }) {
  const beds = card.bedrooms === 0 ? 'Studio' : `${card.bedrooms} bed${card.bedrooms === 1 ? '' : 's'}`
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-rule bg-card shadow-card">
      <div className="relative aspect-[3/2] bg-sunken">
        {card.coverUrl ? (
          <Image
            src={card.coverUrl}
            alt={card.coverAlt ?? ''}
            fill
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
            priority={priority}
            className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.02]"
          />
        ) : null}
        <p className="tag-sand absolute bottom-3 left-3 px-3 py-1 text-sm shadow-card">
          {quote ? (
            <>
              {formatPrice(quote.totalKobo)}
              <span className="font-semibold"> total</span>
            </>
          ) : (
            <>
              {formatPrice(card.nightlyKobo)}
              <span className="font-semibold"> / night</span>
            </>
          )}
        </p>
        {heart ? <div className="absolute top-2 right-2 z-10">{heart}</div> : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="rubric">
            {card.area}, {card.city}
          </p>
          <Rating avg={card.ratingAvg} count={card.ratingCount} />
        </div>
        <h3 className="font-sans text-[1.05rem] font-semibold leading-snug">
          {/* The ::after stretches the link over the whole card (the heart sits above it). */}
          <Link href={href} className="text-ink no-underline after:absolute after:inset-0 after:content-[''] hover:underline">
            {card.title}
          </Link>
        </h3>
        <p className="text-sm text-muted">
          {PROPERTY_TYPE_LABELS[card.propertyType]} · {beds} · {card.bathrooms} bath · up to {card.maxGuests} guest{card.maxGuests === 1 ? '' : 's'}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-sm">
          {quote ? (
            <span className="figures text-muted">
              {quote.nightCount} night{quote.nightCount === 1 ? '' : 's'} · from {formatPrice(Math.min(...quote.nights.map((n) => n.kobo)))} a night
            </span>
          ) : card.weekendKobo && card.weekendKobo !== card.nightlyKobo ? (
            <span className="figures text-muted">Fri &amp; Sat {formatPrice(card.weekendKobo)}</span>
          ) : null}
          {isGuestFavourite(card.ratingAvg, card.ratingCount) ? <span className="font-semibold text-sand-ink">Guest favourite</span> : null}
        </div>
      </div>
    </article>
  )
}

export function StayCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-rule bg-card" aria-hidden>
      <div className="skeleton aspect-[3/2] rounded-none" />
      <div className="space-y-2 p-4">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-5 w-4/5" />
        <div className="skeleton h-4 w-3/5" />
      </div>
    </div>
  )
}
