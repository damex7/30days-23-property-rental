// CLIENT COMPONENT: it responds to keys, swipes and clicks.
'use client'

import Image from 'next/image'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

export type GalleryPhoto = { id: string; url: string; alt: string; width: number; height: number }

/**
 * THE PHOTO GALLERY.
 * - Keyboard: the photo frame is focusable; ← and → move, Home/End jump.
 *   The Previous/Next buttons and the thumbnails work with Tab and Enter.
 * - Touch: swipe left or right on the photo (pointer events, so a mouse
 *   drag works too). A small threshold stops a tap from counting.
 * - Screen readers: the frame is a labelled region, each photo has its
 *   host-written alt text, and "Photo 2 of 5" is announced politely.
 * - Generous photography: the frame is wide, the photo fills it.
 */
export function Gallery({ photos, title }: { photos: GalleryPhoto[]; title: string }) {
  const [index, setIndex] = useState(0)
  const start = useRef<number | null>(null)
  const count = photos.length
  const photo = photos[index]

  if (!photo) {
    return <div className="grid aspect-[16/9] place-items-center rounded-card bg-sunken text-muted">No photos yet</div>
  }

  const go = (next: number) => setIndex(((next % count) + count) % count)

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') go(index + 1)
    else if (event.key === 'ArrowLeft') go(index - 1)
    else if (event.key === 'Home') go(0)
    else if (event.key === 'End') go(count - 1)
    else return
    event.preventDefault()
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    start.current = event.clientX
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (start.current === null) return
    const moved = event.clientX - start.current
    start.current = null
    if (Math.abs(moved) > 40) go(moved < 0 ? index + 1 : index - 1)
  }

  return (
    <div>
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label={`Photos of ${title}. Use the left and right arrow keys to move between photos.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="relative aspect-[4/3] touch-pan-y overflow-hidden rounded-card bg-sunken select-none sm:aspect-[16/9]"
      >
        <Image key={photo.id} src={photo.url} alt={photo.alt} fill priority={index === 0} sizes="(min-width: 1024px) 66vw, 100vw" className="object-cover motion-safe:animate-rise" draggable={false} />
        {count > 1 ? (
          <>
            <button type="button" onClick={() => go(index - 1)} className="absolute top-1/2 left-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-ink shadow-card hover:bg-card">
              <Icon name="chevronLeft" label="Previous photo" />
            </button>
            <button type="button" onClick={() => go(index + 1)} className="absolute top-1/2 right-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-ink shadow-card hover:bg-card">
              <Icon name="chevronRight" label="Next photo" />
            </button>
          </>
        ) : null}
        <p aria-live="polite" className="figures absolute right-3 bottom-3 rounded-pill bg-card/90 px-3 py-1 text-sm font-semibold text-ink">
          Photo {index + 1} of {count}
        </p>
      </div>
      {count > 1 ? (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="All photos">
          {photos.map((p, i) => (
            <li key={p.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index ? 'true' : undefined}
                aria-label={`Show photo ${i + 1}: ${p.alt}`}
                className={cn('relative block h-16 w-24 overflow-hidden rounded-control border-2', i === index ? 'border-primary' : 'border-transparent opacity-80 hover:opacity-100')}
              >
                <Image src={p.url} alt="" fill sizes="96px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
