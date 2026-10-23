// CLIENT COMPONENT: the listing page's "about here" circle.
'use client'

import { useEffect } from 'react'
import { useLeaflet } from './use-leaflet'

/**
 * A CIRCLE, never a pin, centred on the APPROXIMATE coordinates the server
 * computed (approx_lat/approx_lng, db/migrations/011). The exact position
 * isn't in this page at all, so there's nothing here to inspect or leak.
 * The radius (about 700 m) covers the rounding, so the flat is inside.
 */
export function ApproxMap({ lat, lng, area }: { lat: number; lng: number; area: string }) {
  const { container, map, leaflet } = useLeaflet({ center: [lat, lng], zoom: 14 })
  useEffect(() => {
    if (!map || !leaflet) return
    const circle = leaflet.circle([lat, lng], { radius: 700, color: '#6A4FA3', weight: 2, fillColor: '#6A4FA3', fillOpacity: 0.15 }).addTo(map)
    return () => {
      circle.remove()
    }
  }, [map, leaflet, lat, lng])
  return (
    <div
      ref={container}
      className="h-72 w-full overflow-hidden rounded-card border border-rule"
      role="img"
      aria-label={`Map of ${area} with a circle about 1.4 km across. The exact location is shared once you book.`}
    />
  )
}
