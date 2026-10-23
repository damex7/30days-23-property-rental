// URL STATE. The products and movements pages keep their search, filters,
// sort and page in the address (searchParams), so a filtered view can be
// bookmarked, shared on WhatsApp, or reloaded without losing anything.

type ParamValue = string | number | undefined | null

/**
 * Builds "/products?q=milo&page=2" from the current values plus changes.
 * Empty values and the defaults are left out, so URLs stay short.
 */
export function hrefWith(path: string, current: Record<string, ParamValue>, changes: Record<string, ParamValue> = {}, defaults: Record<string, ParamValue> = {}): string {
  const merged = { ...current, ...changes }
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === '') continue
    if (defaults[key] !== undefined && String(defaults[key]) === String(value)) continue
    params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `${path}?${query}` : path
}
