// CLIENT COMPONENT: useFormStatus reads the state of the <form> around it.
'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

/**
 * A submit button that disables itself and says "Working…" while its form
 * is being sent. Disabling stops a double click from sending the form
 * twice (two sign-ups, two reset emails). aria-disabled would keep it
 * focusable, but a real `disabled` is right here: there's nothing to do
 * with it until the answer arrives.
 */
export function SubmitButton({
  children,
  pendingLabel = 'Working…',
  variant = 'primary',
  className,
  disabled = false,
  name,
  value,
  describedBy,
}: {
  children: ReactNode
  pendingLabel?: string
  variant?: keyof typeof button
  className?: string
  /** Day 20: off for a reason (nothing chosen yet, a read-only demo); say why with describedBy. */
  disabled?: boolean
  name?: string
  value?: string
  describedBy?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} aria-describedby={describedBy} className={cn(button[variant], className)}>
      {pending ? (
        <>
          <span aria-hidden className="size-4 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  )
}
