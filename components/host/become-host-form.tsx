'use client'

import { useActionState } from 'react'
import { becomeHostAction } from '@/app/host/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import type { FormState } from '@/lib/validation'

export function BecomeHostForm({ phone }: { phone: string | null }) {
  const [state, action] = useActionState(becomeHostAction, { status: 'idle' } satisfies FormState)
  return (
    <form action={action} noValidate className="space-y-4">
      <ErrorSummary state={state} labels={{ phone: 'Phone number' }} />
      <TextField name="phone" label="Your phone number" hint="Only guests with a confirmed booking see it, so they can call you on arrival." type="tel" autoComplete="tel" inputMode="tel" defaultValue={state.values?.phone ?? phone ?? ''} errors={state.fieldErrors?.phone} />
      <SubmitButton variant="large" pendingLabel="Setting up…">Start hosting</SubmitButton>
    </form>
  )
}
