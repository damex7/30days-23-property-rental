import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { FilterPanel, SortSelect } from '@/components/search/filter-panel'
import { SearchBox } from '@/components/search/search-box'
import { StaysMap } from '@/components/map/stays-map'
import { SaveButton } from '@/components/stays/save-button'
import { StayCard, StayCardSkeleton } from '@/components/stays/stay-card'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { Notice } from '@/components/ui/notice'
import { plural } from '@/lib/format'
import { AMENITY_GROUP_LABELS, AMENITY_GROUPS, PROPERTY_TYPE_LABELS, PROPERTY_TYPES, SORT_LABELS, SORTS } from '@/lib/options'
import { firstValues, searchParamsSchema } from '@/lib/schemas'
import { chipsFor, paramsOf, stayHref } from '@/lib/search-url'
import { listAmenities } from '@/lib/services/listings'
import { searchStays, type SearchResult } from '@/lib/services/search'
import { getPageActor } from '@/lib/services/session-actor'
import { formatRange } from '@/lib/time'

export const metadata: Metadata = { title: 'Find a stay' }

/**
 * /stays: EVERYTHING comes from the URL (where, dates, guests, budget,
 * type, bedrooms, amenities, map box, sort, cursor), so any search can be
 * bookmarked, shared, or opened in a new tab and look exactly the same.
 */
export default function StaysPage({ searchParams }: PageProps<'/stays'>) {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-6 sm:px-6">
      <h1 className="sr-only">Find a stay</h1>
      <Suspense fallback={<ResultsSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Results({ searchParams }: Pick<PageProps<'/stays'>, 'searchParams'>) {
  await connection()
  // Zod with .catch() on every field: a mangled link falls back field by
  // field instead of crashing ("guests=lots" → any number of guests).
  const raw = searchParamsSchema.parse(firstValues(await searchParams))
  const actor = await getPageActor()
  const [result, amenities] = await Promise.all([searchStays(actor, raw), listAmenities(actor)])
  const { filters } = result
  const current = paramsOf(raw, filters)
  const labels = new Map(amenities.map((a) => [a.code, a.label]))
  const chips = chipsFor(current, filters, labels)
  const datesQuery = filters.checkIn && filters.checkOut ? `?checkin=${filters.checkIn}&checkout=${filters.checkOut}${filters.guests ? `&guests=${filters.guests}` : ''}` : ''

  return (
    <>
      <div className="panel mb-5 p-4">
        <SearchBox compact defaults={{ where: raw.where, checkin: filters.checkIn ?? undefined, checkout: filters.checkOut ?? undefined, guests: filters.guests ?? undefined }} keep={{ ...current, where: undefined, checkin: undefined, checkout: undefined, guests: undefined }} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
        <FilterPanel activeCount={chips.length}>
          <FilterForm current={current} filters={filters} amenities={amenities} />
        </FilterPanel>

        <div className="min-w-0">
          {result.notes.length > 0 || result.restarted ? (
            <Notice tone="info" title="We adjusted your search" className="mb-4">
              <ul className="list-disc pl-4">
                {result.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
                {result.restarted ? <li>That page link didn’t match this search, so we started from the first page.</li> : null}
              </ul>
            </Notice>
          ) : null}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            {/* THE RESULT COUNT, announced to screen readers whenever it changes. */}
            <p role="status" aria-live="polite" className="font-semibold">
              {summary(result)}
            </p>
            <form method="get" action="/stays" className="flex items-center gap-2">
              {Object.entries({ ...current, sort: undefined }).map(([name, value]) => (value ? <input key={name} type="hidden" name={name} value={value} /> : null))}
              <label htmlFor="sort" className="text-sm font-semibold">Sort</label>
              <SortSelect>
                <select id="sort" name="sort" defaultValue={filters.sort} className="field min-h-11 px-2">
                  {SORTS.map((s) => (
                    <option key={s} value={s}>{SORT_LABELS[s]}</option>
                  ))}
                </select>
              </SortSelect>
              <noscript>
                <button type="submit" className={button.small}>Apply</button>
              </noscript>
            </form>
          </div>

          {chips.length > 0 ? (
            <ul aria-label="Active filters" className="mb-4 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <Link href={chip.removeHref} className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-edge bg-card px-3 text-sm font-semibold text-ink no-underline hover:bg-selected">
                    {chip.label}
                    <Icon name="close" className="size-3.5" />
                    <span className="sr-only">: remove this filter</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/stays" className="inline-flex min-h-9 items-center px-2 text-sm font-semibold text-primary underline">Clear all</Link>
              </li>
            </ul>
          ) : null}

          {/* THE MAP: beside the list on a wide screen; on a phone, behind "Show map" so the list comes first. */}
          <div className="mb-3 lg:hidden">
            <Link href={stayHref(current, { view: raw.view === 'map' ? undefined : 'map' })} className={button.secondary}>
              <Icon name="mapPin" />
              {raw.view === 'map' ? 'Hide the map' : 'Show the map'}
            </Link>
          </div>
          <div className={raw.view === 'map' ? '' : 'max-lg:hidden'}>
            <StaysMap
              listings={result.items.map((c) => ({ id: c.id, slug: c.slug, title: c.title, lat: c.approxLat, lng: c.approxLng, priceKobo: c.quote?.totalKobo ?? c.nightlyKobo, isTotal: Boolean(c.quote) }))}
              current={current}
              bbox={filters.bbox}
              hrefSuffix={datesQuery}
            />
          </div>

          {result.items.length === 0 ? (
            <EmptyResults result={result} chips={chips} current={current} />
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {result.items.map((card, i) => (
                <li key={card.id}>
                  <StayCard
                    card={card}
                    quote={card.quote}
                    href={`/stays/${card.slug}${datesQuery}`}
                    priority={i < 3}
                    heart={<SaveButton listingId={card.id} saved={card.saved} title={card.title} signedIn={Boolean(actor)} />}
                  />
                </li>
              ))}
            </ul>
          )}

          {/* KEYSET PAGINATION: "next" carries the last row's sort key, never a page number. */}
          {result.nextCursor || raw.cursor ? (
            <nav aria-label="More results" className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {raw.cursor ? <Link href={stayHref(current)} className={button.secondary}>Back to the first page</Link> : null}
              {result.nextCursor ? (
                <Link href={stayHref(current, { cursor: result.nextCursor })} className={button.primary}>
                  Next page
                  <Icon name="arrowRight" />
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </div>
    </>
  )
}

function summary(result: SearchResult): string {
  const { filters } = result
  const where = filters.where ? ` near “${filters.where}”` : ''
  const when = filters.checkIn && filters.checkOut ? `, free ${formatRange(filters.checkIn, filters.checkOut)}` : ''
  if (result.total === null) return `More stays${where}${when}`
  if (result.total === 0) return `No stays found${where}${when}`
  return `${plural(result.total, 'stay')}${where}${when}`
}

/** NO RESULTS: say why, and offer the one-click fixes (each removes ONE filter). */
function EmptyResults({ result, chips, current }: { result: SearchResult; chips: ReturnType<typeof chipsFor>; current: Record<string, string | undefined> }) {
  return (
    <EmptyState title="Nothing matches all of that">
      {result.suggestion ? (
        <p className="mb-3">
          Did you mean{' '}
          <Link href={stayHref(current, { where: result.suggestion.place })}>
            {result.suggestion.place}
            {result.suggestion.place !== result.suggestion.city ? `, ${result.suggestion.city}` : ''}
          </Link>
          ?
        </p>
      ) : null}
      {chips.length > 0 ? (
        <>
          <p>Try removing one filter:</p>
          <ul className="mt-2 flex flex-wrap justify-center gap-2">
            {chips.map((chip) => (
              <li key={chip.key}>
                <Link href={chip.removeHref}>Without {chip.label.toLowerCase().startsWith('near') ? 'the place' : chip.label}</Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>There are no published stays yet. Check back soon.</p>
      )}
    </EmptyState>
  )
}

/** The filters as ONE plain GET form: works without JavaScript, and its result is a URL. */
function FilterForm({ current, filters, amenities }: { current: Record<string, string | undefined>; filters: SearchResult['filters']; amenities: { code: string; label: string; grp: string }[] }) {
  const chosen = new Set(filters.amenities)
  return (
    <form method="get" action="/stays" className="space-y-5 lg:sticky lg:top-4">
      {['where', 'checkin', 'checkout', 'guests', 'sort', 'bbox', 'view'].map((name) => (current[name] ? <input key={name} type="hidden" name={name} value={current[name]} /> : null))}
      <fieldset>
        <legend className="mb-1.5 font-semibold">Price per night (₦)</legend>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="f-min" className="text-sm text-muted">Min</label>
            <input id="f-min" name="min" inputMode="numeric" pattern="[0-9]*" defaultValue={current.min} placeholder="0" className="field min-h-11 w-full px-2" />
          </div>
          <div>
            <label htmlFor="f-max" className="text-sm text-muted">Max</label>
            <input id="f-max" name="max" inputMode="numeric" pattern="[0-9]*" defaultValue={current.max} placeholder="Any" className="field min-h-11 w-full px-2" />
          </div>
        </div>
      </fieldset>
      <div>
        <label htmlFor="f-type" className="mb-1.5 block font-semibold">Type of place</label>
        <select id="f-type" name="type" defaultValue={current.type ?? ''} className="field min-h-11 w-full px-2">
          <option value="">Any type</option>
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-bedrooms" className="mb-1.5 block font-semibold">Bedrooms</label>
        <select id="f-bedrooms" name="bedrooms" defaultValue={current.bedrooms ?? ''} className="field min-h-11 w-full px-2">
          <option value="">Any</option>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>{n}+</option>
          ))}
        </select>
      </div>
      {/* Checkboxes named "amenity": the form sends amenity=wifi&amenity=pool, and proxy.ts rewrites that to the canonical ?amenities=wifi,pool. */}
      <AmenityFieldsets amenities={amenities} chosen={chosen} />
      <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
        <button type="submit" className={`${button.primary} flex-1`}>Show stays</button>
        <Link href={stayHref({ where: current.where, checkin: current.checkin, checkout: current.checkout, guests: current.guests })} className={button.ghost}>Reset</Link>
      </div>
    </form>
  )
}

function AmenityFieldsets({ amenities, chosen }: { amenities: { code: string; label: string; grp: string }[]; chosen: Set<string> }) {
  return (
    <>
      {AMENITY_GROUPS.map((grp) => {
        const items = amenities.filter((a) => a.grp === grp)
        if (items.length === 0) return null
        return (
          <fieldset key={grp}>
            <legend className="mb-1.5 font-semibold">{AMENITY_GROUP_LABELS[grp]}</legend>
            <ul className="space-y-1">
              {items.map((a) => (
                <li key={a.code}>
                  <label className="flex min-h-9 items-center gap-2.5">
                    <input type="checkbox" name="amenity" value={a.code} defaultChecked={chosen.has(a.code)} className="size-5 accent-primary" />
                    {a.label}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )
      })}
    </>
  )
}

function ResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Searching">
      <div className="skeleton mb-5 h-20 w-full rounded-card" />
      <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
        <div className="skeleton h-96 rounded-card max-lg:hidden" />
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <StayCardSkeleton key={i} />)}
        </div>
      </div>
    </div>
  )
}
