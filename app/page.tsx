import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { DemoButtons } from '@/components/auth/demo-button'
import { Mark } from '@/components/brand/mark'
import { SearchBox } from '@/components/search/search-box'
import { StayCard, StayCardSkeleton } from '@/components/stays/stay-card'
import { Flash } from '@/components/ui/flash'
import { Icon, type IconName } from '@/components/ui/icon'
import { firstValues } from '@/lib/schemas'
import { isDemoMode } from '@/lib/services/demo'
import { listAreas, listFeatured } from '@/lib/services/listings'
import { suggestedDates } from '@/lib/services/search'
import { site } from '@/lib/site'

export const metadata: Metadata = { title: { absolute: `${site.name}: short-lets in Lagos, Abuja, Port Harcourt and Ibadan` } }

const PROMISES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'calendar', title: 'Only places that are free', body: 'Pick your dates and you see only flats with every one of those nights open, priced for exactly that stay.' },
  { icon: 'bolt', title: 'Power you can plan around', body: 'Filter for 24/7 power, generator, inverter or solar, and read what past guests scored the power supply.' },
  { icon: 'shield', title: 'Checked before it’s listed', body: 'A person reviews every listing before it goes live. The exact address is shared only once you’ve booked.' },
]

export default function HomePage({ searchParams }: PageProps<'/'>) {
  return (
    <>
      <Suspense fallback={null}>
        <Notice searchParams={searchParams} />
      </Suspense>
      {/* HERO: concrete with one jacaranda accent, a calm editorial layout. */}
      <section aria-labelledby="hero" className="border-b border-rule bg-page">
        <div className="mx-auto grid max-w-page gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.15fr_1fr] md:py-16">
          <div>
            <p className="rubric">The guest register · Lagos · Abuja · Port Harcourt · Ibadan</p>
            <h1 className="mt-3 text-[2.6rem] leading-[1.05] sm:text-6xl">
              A good place to stay, <span className="text-primary">kept properly.</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted">
              Serviced apartments and short-lets from Lekki Phase 1 to Maitama. Search by area, dates and budget, see the full price for your nights, and pay with Paystack.
            </p>
            <div className="mt-6 panel p-4 sm:p-5">
              <Suspense fallback={<div className="skeleton h-40 w-full" />}>
                <HeroSearch />
              </Suspense>
            </div>
          </div>
          <div className="relative hidden md:block" aria-hidden>
            <div className="absolute inset-0 rotate-2 rounded-card bg-sunken" />
            <div className="relative flex h-full flex-col justify-between rounded-card border border-rule bg-card p-8 shadow-card">
              <Mark className="size-24 text-primary" />
              <div className="space-y-3 font-display text-2xl">
                <p className="border-b border-rule pb-3">Arrival · 20 December</p>
                <p className="border-b border-rule pb-3">Wuse 2, Abuja</p>
                <p className="text-primary">4 nights, all paid</p>
              </div>
              <p className="rubric">Every stay in one register</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-page px-4 py-12 sm:px-6">
        <section aria-labelledby="areas">
          <h2 id="areas" className="text-3xl">Where to?</h2>
          <Suspense fallback={<div className="skeleton mt-4 h-28 w-full" />}>
            <Areas />
          </Suspense>
        </section>

        <section aria-labelledby="featured" className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="featured" className="text-3xl">Guests’ favourites</h2>
            <Link href="/stays" className="link">See every stay</Link>
          </div>
          <Suspense
            fallback={
              <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => <StayCardSkeleton key={i} />)}
              </div>
            }
          >
            <Featured />
          </Suspense>
        </section>

        <section aria-labelledby="promises" className="mt-12 grid gap-4 md:grid-cols-3">
          <h2 id="promises" className="sr-only">What we promise</h2>
          {PROMISES.map((p) => (
            <div key={p.title} className="panel p-5">
              <Icon name={p.icon} className="size-6 text-primary" />
              <h3 className="mt-3 text-xl">{p.title}</h3>
              <p className="mt-1 text-muted">{p.body}</p>
            </div>
          ))}
        </section>

        {isDemoMode() ? (
          <section aria-labelledby="demo" className="mt-12 rounded-card border border-dashed border-edge bg-sunken p-6 sm:p-8">
            <h2 id="demo" className="text-3xl">Just looking?</h2>
            <p className="mt-2 mb-5 max-w-2xl text-muted">
              Book as a private demo guest, with an upcoming trip already made and a past stay to review (pay with the Paystack test card), or look around the shared host desk, which is read-only. No email or password; demo guests are deleted after 24 hours.
            </p>
            <DemoButtons />
          </section>
        ) : null}
      </div>
    </>
  )
}

async function Notice({ searchParams }: Pick<PageProps<'/'>, 'searchParams'>) {
  const notice = firstValues(await searchParams).notice
  const message = notice === 'signed-out' ? 'You’re signed out.' : null
  return message ? <div className="mx-auto max-w-page px-4 pt-6 sm:px-6"><Flash message={message} /></div> : null
}

/** The search box, with suggested dates (a week from Lagos today: reading the clock makes this part dynamic). */
async function HeroSearch() {
  await connection()
  const dates = suggestedDates()
  return <SearchBox defaults={{ checkin: dates.checkIn, checkout: dates.checkOut }} />
}

async function Areas() {
  await connection()
  const areas = await listAreas(null)
  return (
    <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {areas.map((a) => (
        <li key={`${a.area}-${a.city}`}>
          <Link
            href={`/stays?where=${encodeURIComponent(a.area)}`}
            className="flex h-full flex-col rounded-card border border-rule bg-card p-4 no-underline shadow-card transition-colors hover:border-primary"
          >
            <span className="font-display text-lg text-ink">{a.area}</span>
            <span className="text-sm text-muted">
              {a.city} · {a.count} stay{a.count === 1 ? '' : 's'}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

async function Featured() {
  await connection()
  const cards = await listFeatured(null, 6)
  return (
    <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card, i) => (
        <li key={card.id}>
          <StayCard card={card} href={`/stays/${card.slug}`} priority={i < 3} />
        </li>
      ))}
    </ul>
  )
}
