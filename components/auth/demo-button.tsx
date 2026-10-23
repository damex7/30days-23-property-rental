'use client'

import { useActionState } from 'react'
import { tryDemo } from '@/app/(auth)/actions'
import { SubmitButton } from '@/components/forms/submit-button'
import { Notice } from '@/components/ui/notice'
import type { FormState } from '@/lib/validation'

/**
 * The two demo buttons: POST forms (Server Actions), never links, so search
 * crawlers and WhatsApp link previews can't create accounts by visiting
 * them. "Try as a guest" makes a private demo guest with an upcoming trip
 * and a stay to review; "Look around as a host" opens the shared,
 * read-only demo host.
 */
export function DemoButtons() {
  const [state, action] = useActionState(tryDemo, { status: 'idle' } satisfies FormState)
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.status === 'error' ? (
        <Notice tone="danger" title="The demo couldn’t start" live>
          <p>{state.message}</p>
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <SubmitButton name="as" value="guest" variant="largeSecondary" pendingLabel="Setting up your trip…">
          Try as a guest
        </SubmitButton>
        <SubmitButton name="as" value="host" variant="largeSecondary" pendingLabel="Opening the host desk…">
          Look around as a host
        </SubmitButton>
      </div>
    </form>
  )
}
