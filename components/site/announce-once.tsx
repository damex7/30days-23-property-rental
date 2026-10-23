'use client'

import { useEffect, useState } from 'react'

/**
 * Says something to screen-reader users ONCE, politely, after the page has
 * loaded. A live region only announces CHANGES, so the text is put in after
 * the first render; text that is there from the start would be skipped.
 */
export function AnnounceOnce({ message }: { message: string }) {
  const [text, setText] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setText(message), 600)
    return () => clearTimeout(timer)
  }, [message])
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {text}
    </p>
  )
}
