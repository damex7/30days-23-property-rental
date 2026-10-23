// CLIENT COMPONENT: the wishlist heart.
'use client'

import Link from 'next/link'
import { useOptimistic, useTransition } from 'react'
import { toggleSavedAction } from '@/app/saved/actions'
import { cn } from '@/lib/cn'

/**
 * THE HEART: a toggle button (aria-pressed says "saved" or not, in words),
 * filled jacaranda when saved and outlined when not, so the state isn't
 * colour alone. It flips at once (useOptimistic) and the server catches up;
 * a failure flips it back. Signed out, it's a link to sign in.
 */
export function SaveButton({ listingId, saved, title, signedIn }: { listingId: string; saved: boolean; title: string; signedIn: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(saved)
  const [, start] = useTransition()
  const cls = 'grid size-11 place-items-center rounded-full bg-card/95 text-primary shadow-card transition-transform hover:scale-105'
  const heart = (filled: boolean) => (
    <svg viewBox="0 0 24 24" className="size-5.5" aria-hidden fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.7 3.9 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.7 1.1-1.6 2.7-2.7 4.7-2.7 3.4 0 5.7 3.2 4.5 6.7-1.7 4.7-9.2 9.3-9.2 9.3Z" strokeLinejoin="round" />
    </svg>
  )
  if (!signedIn) {
    return (
      <Link href="/login" className={cls} aria-label={`Sign in to save ${title}`}>
        {heart(false)}
      </Link>
    )
  }
  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={`Save ${title}`}
      className={cn(cls)}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic)
          await toggleSavedAction(listingId, !optimistic)
        })
      }
    >
      {heart(optimistic)}
    </button>
  )
}
