'use client'

import { useActionState } from 'react'
import { forgotPassword } from '@/app/(auth)/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { Notice } from '@/components/ui/notice'
import { EMAIL_MAX, type FormState } from '@/lib/validation'

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPassword, { status: 'idle' } satisfies FormState<'email'>)

  return (
    <form action={action} noValidate>
      <ErrorSummary state={state} labels={{ email: 'Email address' }} />
      {/* The same words whether or not the account exists: see forgotPassword(). */}
      {state.status === 'success' ? (
        <Notice tone="success" title="Check your inbox" className="mb-6" live>
          <p>{state.message}</p>
        </Notice>
      ) : null}
      <div className="space-y-5">
        <TextField
          name="email"
          type="email"
          label="Email address"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={EMAIL_MAX}
          defaultValue={state.values?.email}
          errors={state.fieldErrors?.email}
        />
        <SubmitButton className="w-full">{state.status === 'success' ? 'Send another link' : 'Send reset link'}</SubmitButton>
      </div>
    </form>
  )
}
