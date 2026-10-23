'use client'

import { useActionState } from 'react'
import { resetPassword } from '@/app/(auth)/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { PasswordField } from '@/components/forms/password-field'
import { SubmitButton } from '@/components/forms/submit-button'
import { PASSWORD_MAX, PASSWORD_MIN, type FormState } from '@/lib/validation'

/**
 * The token travels in a hidden field, back to the Server Action, which
 * checks and uses it. The email is shown so password managers save the new
 * password against the right account (a hidden username field with
 * autocomplete="username" is how they learn which account it is).
 */
export function ResetPasswordForm({ token, email, name }: { token: string; email: string; name: string }) {
  const [state, action] = useActionState(resetPassword, { status: 'idle' } satisfies FormState<'password'>)

  return (
    <form action={action} noValidate>
      <ErrorSummary state={state} labels={{ password: 'New password' }} />
      <input type="hidden" name="token" value={token} />
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className="space-y-5">
        <PasswordField
          key={state.submissionId}
          name="password"
          label="New password"
          autoComplete="new-password"
          showStrength
          userInputs={[name, email]}
          hint={`${PASSWORD_MIN} to ${PASSWORD_MAX} characters. Every device signed in to this account will be signed out.`}
          errors={state.fieldErrors?.password}
        />
        <SubmitButton className="w-full">Save new password</SubmitButton>
      </div>
    </form>
  )
}
