'use client'

import { useActionState, type ReactNode } from 'react'
import { button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import type { FormState } from '@/lib/validation'
import { SubmitButton } from './submit-button'

/**
 * A one-button form for actions like "Sign out this device" or "Make
 * admin": hidden fields name WHAT to act on, the Server Action checks WHO
 * is asking. The result is announced through role="status" without moving
 * focus.
 */
export function ActionButton({
  action,
  fields = {},
  children,
  pendingLabel,
  variant = 'small',
  className,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  fields?: Record<string, string>
  children: ReactNode
  pendingLabel?: string
  variant?: keyof typeof button
  className?: string
}) {
  const [state, formAction] = useActionState(action, { status: 'idle' } satisfies FormState)
  return (
    <form action={formAction} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton variant={variant} pendingLabel={pendingLabel}>
        {children}
      </SubmitButton>
      <p role="status" className={cn('text-sm font-semibold empty:sr-only', 'text-ink')}>
        {state.status !== 'idle' ? state.message : null}
      </p>
    </form>
  )
}
