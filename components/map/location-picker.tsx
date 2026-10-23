// CLIENT COMPONENT: the host's draggable pin.
'use client'

import { useEffect, useRef } from 'react'
import type * as L from 'leaflet'
import { useLeaflet } from './use-leaflet'

const LAGOS: [number, number] = [6.4478, 3.4723]

/**
 * DRAG THE PIN (or click the map) to the building. The latitude and
 * longitude boxes under the map show the same numbers and can be typed
 * into instead: the map is never the only way to set the location.
 */
export function LocationPicker({ lat, lng, set }: { lat: string; lng: string; set: (lat: number, lng: number) => void }) {
  const start: [number, number] = Number.isFinite(Number.parseFloat(lat)) && Number.isFinite(Number.parseFloat(lng)) ? [Number(lat), Number(lng)] : LAGOS
  const { container, map, leaflet } = useLeaflet({ center: start, zoom: lat ? 16 : 12 })
  const marker = useRef<L.Marker | null>(null)
  const setRef = useRef(set)
  useEffect(() => {
    setRef.current = set
  }, [set])

  // Make the pin once the map exists.
  useEffect(() => {
    if (!map || !leaflet) return
    const icon = leaflet.divIcon({
      className: '',
      html: '<span style="display:block;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#6A4FA3;border:3px solid #FCFBF9;box-shadow:0 2px 6px rgb(0 0 0 / .35)"></span>',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    })
    const pin = leaflet.marker(map.getCenter(), { draggable: true, icon, keyboard: true, title: 'The building (drag to move)', alt: 'Location pin' }).addTo(map)
    pin.on('dragend', () => {
      const p = pin.getLatLng()
      setRef.current(p.lat, p.lng)
    })
    map.on('click', (event: L.LeafletMouseEvent) => {
      pin.setLatLng(event.latlng)
      setRef.current(event.latlng.lat, event.latlng.lng)
    })
    marker.current = pin
    return () => {
      pin.remove()
      map.off('click')
    }
  }, [map, leaflet])

  // Typing in the boxes moves the pin.
  useEffect(() => {
    const a = Number.parseFloat(lat)
    const b = Number.parseFloat(lng)
    if (!marker.current || !map || !Number.isFinite(a) || !Number.isFinite(b)) return
    const current = marker.current.getLatLng()
    if (Math.abs(current.lat - a) > 1e-7 || Math.abs(current.lng - b) > 1e-7) {
      marker.current.setLatLng([a, b])
      map.panTo([a, b])
    }
  }, [lat, lng, map])

  return (
    <div>
      <div ref={container} className="h-72 w-full overflow-hidden rounded-card border border-rule" role="application" aria-label="Map: drag the pin to your building, or use the latitude and longitude boxes below" />
      <p className="mt-1 text-xs text-muted">Tip: zoom in with the + button, then drag the violet pin onto the roof of the building.</p>
    </div>
  )
}
