// The body of the error boundaries (app/error.tsx and friends). A Client
// Component: it renders after the server gave up, and its "Try again"
// button runs in the browser. In production the browser never sees the
// real error (only a digest that matches the server log), so the message
// covers the likely case, a database that didn't answer, without guessing.
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { startTransition, useEffect } from 'react'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

export function ErrorPanel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div role="alert" className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-4 grid size-14 place-items-center rounded-full border-2 border-dashed border-edge text-ink">
        <Icon name="cloudOff" className="size-6" />
      </span>
      <h1 className="text-3xl">We couldn’t reach Staybook just now</h1>
      <p className="mt-3 text-muted">
        Most often the database is waking up after a quiet spell, which takes a few seconds, or the connection dropped. Your bookings are safe:
        anything that wasn’t saved was not saved at all (every save is all-or-nothing), so it’s safe to try again.
      </p>
      {/* In production Next.js hides the real message from the browser; the
          digest matches the full error in the server logs. */}
      {error.digest ? <p className="figures mt-2 text-xs text-muted">Reference: {error.digest}</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          className={button.primary}
          // Re-run the server part (refresh) and the boundary (reset) together.
          onClick={() =>
            startTransition(() => {
              router.refresh()
              reset()
            })
          }
        >
          Try again
        </button>
        <Link href="/" className={button.secondary}>
          Home
        </Link>
      </div>
    </div>
  )
}
