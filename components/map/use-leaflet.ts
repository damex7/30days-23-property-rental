// CLIENT ONLY: loads Leaflet and makes a map in a <div>.
//
// WHY LEAFLET + OPENSTREETMAP? Leaflet is small (about 40 kB), has no API
// key and no billing account, and draws tiles from any source. Google Maps
// needs a key with a card on file and its terms forbid showing its tiles
// with non-Google maps; Mapbox meters every load. OpenStreetMap's map of
// Lagos, Abuja and Port Harcourt is detailed and community-edited.
//
// THE TILE USAGE POLICY (tile.openstreetmap.org): the volunteer-run servers
// are free for light use, on these terms, which this file follows:
//   - show the attribution "© OpenStreetMap contributors" (Leaflet's
//     attribution control, always visible);
//   - don't bulk-download or pre-fetch tiles, and don't go past zoom 19;
//   - send a valid Referer (browsers do; our Referrer-Policy keeps the origin);
//   - for heavy traffic, switch to a commercial tile provider or your own
//     tile server: one line below (TILE_URL).
//
// Leaflet touches `window` the moment it's imported, so it's imported INSIDE
// the effect (only ever in the browser), never at the top of a module that
// a Server Component might render.
'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import type * as L from 'leaflet'

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export function useLeaflet(options: { center: [number, number]; zoom: number }) {
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<L.Map | null>(null)
  const [leaflet, setLeaflet] = useState<typeof L | null>(null)

  useEffect(() => {
    let cancelled = false
    let instance: L.Map | null = null
    void import('leaflet').then((mod) => {
      const lib = (mod as unknown as { default?: typeof L }).default ?? (mod as unknown as typeof L)
      if (cancelled || !container.current) return
      instance = lib.map(container.current, { center: options.center, zoom: options.zoom, scrollWheelZoom: false })
      lib.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(instance)
      setLeaflet(lib)
      setMap(instance)
    })
    return () => {
      cancelled = true
      instance?.remove()
    }
    // The map is made once; later changes are applied by the components.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { container, map, leaflet }
}
