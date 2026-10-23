// CLIENT COMPONENT: a live countdown, and a quiet poll while a payment is being confirmed.
'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

function remaining(expiresAt: string, now: number): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000))
}

/**
 * A HELD booking: "Held for 12:34". Every few seconds it asks the server
 * for the page again (router.refresh), so when Paystack's webhook confirms
 * the payment the page turns "Confirmed" by itself. When the hold runs
 * out, it refreshes once more and shows "Hold expired". The time left is
 * announced only at the minute marks, not every second (that would drown
 * a screen reader).
 */
export function HoldStatus({ expiresAt }: { expiresAt: string }) {
  const router = useRouter()
  const [now, setNow] = useState(() => Date.now())
  const seconds = remaining(expiresAt, now)

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const poll = setInterval(() => router.refresh(), 5000)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [router])

  useEffect(() => {
    if (seconds === 0) router.refresh()
  }, [seconds, router])

  const minutes = Math.floor(seconds / 60)
  const label = `${minutes}:${String(seconds % 60).padStart(2, '0')}`
  return (
    <p className="font-semibold">
      <span aria-hidden className="figures">Held for {label}</span>
      <span role="status" className="sr-only">{seconds % 60 === 0 || seconds < 10 ? `${minutes} minute${minutes === 1 ? '' : 's'} left to pay` : ''}</span>
    </p>
  )
}
