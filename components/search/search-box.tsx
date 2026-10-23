import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

/** The places people search for most, offered as suggestions (typing anything else works too). */
const PLACES = ['Lekki Phase 1', 'Victoria Island', 'Ikoyi', 'Yaba', 'Wuse 2', 'Maitama', 'Gwarinpa', 'GRA, Port Harcourt', 'Bodija, Ibadan', 'Abuja', 'Lagos']

/**
 * WHERE, WHEN, WHO: a plain GET form to /stays, so the search ends up in
 * the URL and works before any JavaScript has loaded. The dates are native
 * date inputs here (the OS picker is large and thumb-friendly on a phone);
 * the listing page has the full availability calendar. `keep` carries the
 * other filters over when this box is used on the results page.
 */
export function SearchBox({
  defaults = {},
  keep = {},
  compact = false,
}: {
  defaults?: { where?: string; checkin?: string; checkout?: string; guests?: number }
  keep?: Record<string, string | undefined>
  compact?: boolean
}) {
  return (
    <form method="get" action="/stays" role="search" aria-label="Search stays" className={compact ? 'grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end' : 'grid gap-3 sm:grid-cols-2'}>
      {Object.entries(keep).map(([name, value]) => (value ? <input key={name} type="hidden" name={name} value={value} /> : null))}
      <div className={compact ? '' : 'sm:col-span-2'}>
        <label htmlFor="s-where" className="mb-1 block text-sm font-semibold">Where</label>
        <input
          id="s-where"
          name="where"
          type="search"
          list="s-places"
          defaultValue={defaults.where}
          placeholder="Area or city, like Lekki or Wuse 2"
          maxLength={60}
          autoComplete="off"
          className="field min-h-12 w-full px-3"
        />
        <datalist id="s-places">
          {PLACES.map((place) => (
            <option key={place} value={place} />
          ))}
        </datalist>
      </div>
      <div>
        <label htmlFor="s-checkin" className="mb-1 block text-sm font-semibold">Check in</label>
        <input id="s-checkin" name="checkin" type="date" defaultValue={defaults.checkin} className="field min-h-12 w-full px-3" />
      </div>
      <div>
        <label htmlFor="s-checkout" className="mb-1 block text-sm font-semibold">Check out</label>
        <input id="s-checkout" name="checkout" type="date" defaultValue={defaults.checkout} className="field min-h-12 w-full px-3" />
      </div>
      <div>
        <label htmlFor="s-guests" className="mb-1 block text-sm font-semibold">Guests</label>
        <select id="s-guests" name="guests" defaultValue={defaults.guests ? String(defaults.guests) : ''} className="field min-h-12 w-full px-3">
          <option value="">Any</option>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} guest{n === 1 ? '' : 's'}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={`${button.primary} min-h-12 ${compact ? '' : 'sm:self-end'}`}>
        <Icon name="search" />
        Search
      </button>
    </form>
  )
}
