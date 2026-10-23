// CLIENT COMPONENT: the results on a map, with "Search as I move the map".
'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type * as L from 'leaflet'
import { formatNairaCompact } from '@/lib/money'
import { stayHref } from '@/lib/search-url'
import { useLeaflet } from './use-leaflet'

export type MapListing = { id: string; slug: string; title: string; lat: number; lng: number; priceKobo: number; isTotal: boolean }
type BBox = { south: number; west: number; north: number; east: number }

const NIGERIA: L.LatLngBoundsExpression = [[4.2, 2.7], [13.9, 14.7]]

/**
 * THE RESULTS MAP. Every pin is a sand price tag ("₦85K") at the
 * APPROXIMATE position, and a link to the listing.
 *
 * "SEARCH AS I MOVE THE MAP": when ticked, each pan or zoom puts the visible
 * box into the URL (?bbox=south,west,north,east) and the server runs the
 * same one query with the box as a filter, so the list and the map always
 * agree and the URL can still be shared. Unticked, moving the map changes
 * nothing. The map is never the only way to do anything: every listing is
 * in the list beside it, which works on its own.
 */
export function StaysMap({ listings, current, bbox, hrefSuffix }: { listings: MapListing[]; current: Record<string, string | undefined>; bbox: BBox | null; hrefSuffix: string }) {
  const router = useRouter()
  const { container, map, leaflet } = useLeaflet({ center: [9.06, 7.49], zoom: 6 })
  const [follow, setFollow] = useState(Boolean(bbox))
  const followRef = useRef(follow)
  const currentRef = useRef(current)
  const fitted = useRef(false)

  useEffect(() => {
    followRef.current = follow
    currentRef.current = current
  })

  // The pins.
  useEffect(() => {
    if (!map || !leaflet) return
    const layer = leaflet.layerGroup().addTo(map)
    for (const l of listings) {
      const icon = leaflet.divIcon({
        className: '',
        html: `<span style="display:inline-block;transform:translate(-50%,-100%);white-space:nowrap;background:#C9A66B;color:#26252D;font:700 13px/1 system-ui,sans-serif;padding:6px 9px;border-radius:999px;box-shadow:0 2px 6px rgb(0 0 0 / .3);font-variant-numeric:tabular-nums">${formatNairaCompact(l.priceKobo)}</span>`,
        iconSize: [0, 0],
      })
      leaflet
        .marker([l.lat, l.lng], { icon, title: `${l.title}: ${formatNairaCompact(l.priceKobo)}${l.isTotal ? ' total' : ' a night'}`, keyboard: true, alt: l.title })
        .on('click', () => router.push(`/stays/${l.slug}${hrefSuffix}`))
        .addTo(layer)
    }
    // Fit the first time (unless the URL already set the box).
    if (!fitted.current) {
      fitted.current = true
      if (bbox) map.fitBounds([[bbox.south, bbox.west], [bbox.north, bbox.east]])
      else if (listings.length > 0) map.fitBounds(leaflet.latLngBounds(listings.map((l) => [l.lat, l.lng])).pad(0.2), { maxZoom: 14 })
      else map.fitBounds(NIGERIA)
    }
    return () => {
      layer.remove()
    }
  }, [map, leaflet, listings, bbox, hrefSuffix, router])

  // Moving the map searches, when asked to.
  useEffect(() => {
    if (!map) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const onMove = () => {
      if (!followRef.current) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const b = map.getBounds()
        const box = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((n) => n.toFixed(4)).join(',')
        router.replace(stayHref(currentRef.current, { bbox: box }), { scroll: false })
      }, 400)
    }
    map.on('moveend', onMove)
    return () => {
      clearTimeout(timer)
      map.off('moveend', onMove)
    }
  }, [map, router])

  return (
    <div className="mb-5">
      <div ref={container} className="h-80 w-full overflow-hidden rounded-card border border-rule lg:h-96" role="region" aria-label="Map of the results. Every result is also in the list below." />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-11 items-center gap-2.5 font-semibold">
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => {
              setFollow(e.target.checked)
              if (!e.target.checked && current.bbox) router.replace(stayHref(current, { bbox: undefined }), { scroll: false })
            }}
            className="size-5 accent-primary"
          />
          Search as I move the map
        </label>
        <p className="text-xs text-muted">Pins show approximate locations.</p>
      </div>
    </div>
  )
}
