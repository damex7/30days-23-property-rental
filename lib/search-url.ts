// THE SEARCH URL, both ways: from the parsed parameters back to a URL (for
// "remove this filter", "next page", "sort by"), and the list of active
// filters as chips. Pure functions, so the page and the map share them.
import { hrefWith } from './url'
import { formatPrice } from './money'
import { PROPERTY_TYPE_LABELS, SORTS, type Sort } from './options'
import type { SearchParams } from './schemas'
import type { SearchFilters } from './services/search'
import { formatRange } from './time'

type Params = Record<string, string | undefined>

/** The URL parameters for these filters (the values as the visitor gave them, so links read naturally). */
export function paramsOf(raw: SearchParams, filters: SearchFilters): Params {
  return {
    where: raw.where,
    checkin: filters.checkIn ?? undefined,
    checkout: filters.checkOut ?? undefined,
    guests: filters.guests ? String(filters.guests) : undefined,
    min: filters.minNaira !== null ? String(filters.minNaira) : undefined,
    max: filters.maxNaira !== null ? String(filters.maxNaira) : undefined,
    type: filters.type ?? undefined,
    bedrooms: filters.bedrooms ? String(filters.bedrooms) : undefined,
    amenities: filters.amenities.length ? filters.amenities.join(',') : undefined,
    bbox: filters.bbox ? [filters.bbox.south, filters.bbox.west, filters.bbox.north, filters.bbox.east].join(',') : undefined,
    sort: filters.sort === SORTS[0] ? undefined : filters.sort,
    view: raw.view === 'map' ? 'map' : undefined,
  }
}

/** A /stays URL from the current parameters plus changes. Any change drops the cursor: page 1 of the new search. */
export function stayHref(current: Params, changes: Params = {}): string {
  return hrefWith('/stays', current, { cursor: undefined, ...changes })
}

export type Chip = { key: string; label: string; removeHref: string }

/** One chip per active filter, each with the URL that removes just that filter. */
export function chipsFor(current: Params, filters: SearchFilters, amenityLabels: Map<string, string>): Chip[] {
  const chips: Chip[] = []
  if (current.where) chips.push({ key: 'where', label: `Near “${current.where}”`, removeHref: stayHref(current, { where: undefined }) })
  if (filters.checkIn && filters.checkOut) chips.push({ key: 'dates', label: formatRange(filters.checkIn, filters.checkOut), removeHref: stayHref(current, { checkin: undefined, checkout: undefined }) })
  if (filters.guests) chips.push({ key: 'guests', label: `${filters.guests} guest${filters.guests === 1 ? '' : 's'}`, removeHref: stayHref(current, { guests: undefined }) })
  if (filters.minNaira !== null || filters.maxNaira !== null) {
    const label =
      filters.minNaira !== null && filters.maxNaira !== null
        ? `${formatPrice(filters.minNaira * 100)} – ${formatPrice(filters.maxNaira * 100)} a night`
        : filters.minNaira !== null
          ? `From ${formatPrice(filters.minNaira * 100)} a night`
          : `Up to ${formatPrice(filters.maxNaira! * 100)} a night`
    chips.push({ key: 'price', label, removeHref: stayHref(current, { min: undefined, max: undefined }) })
  }
  if (filters.type) chips.push({ key: 'type', label: PROPERTY_TYPE_LABELS[filters.type], removeHref: stayHref(current, { type: undefined }) })
  if (filters.bedrooms) chips.push({ key: 'bedrooms', label: `${filters.bedrooms}+ bedroom${filters.bedrooms === 1 ? '' : 's'}`, removeHref: stayHref(current, { bedrooms: undefined }) })
  for (const code of filters.amenities) {
    const rest = filters.amenities.filter((c) => c !== code)
    chips.push({ key: `amenity-${code}`, label: amenityLabels.get(code) ?? code, removeHref: stayHref(current, { amenities: rest.length ? rest.join(',') : undefined }) })
  }
  if (filters.bbox) chips.push({ key: 'bbox', label: 'Map area', removeHref: stayHref(current, { bbox: undefined }) })
  return chips
}

export function isSort(value: string): value is Sort {
  return (SORTS as readonly string[]).includes(value)
}
