'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { login } from '@/app/(auth)/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { TextField } from '@/components/forms/field'
import { PasswordField } from '@/components/forms/password-field'
import { SubmitButton } from '@/components/forms/submit-button'
import { EMAIL_MAX, type FormState } from '@/lib/validation'

type Field = 'email' | 'password'
const LABELS: Record<Field, string> = { email: 'Email address', password: 'Password' }

/** `next` is where to go after signing in. The server checks it with safeNextPath. */
export function LoginForm({ next }: { next: string | null }) {
  const [state, action] = useActionState(login, { status: 'idle' } satisfies FormState<Field>)

  return (
    <form action={action} noValidate>
      <ErrorSummary state={state} labels={LABELS} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="space-y-5">
        <TextField
          name="email"
          type="email"
          label={LABELS.email}
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={EMAIL_MAX}
          defaultValue={state.values?.email}
          errors={state.fieldErrors?.email}
        />
        <div>
          <PasswordField key={state.submissionId} name="password" label={LABELS.password} autoComplete="current-password" errors={state.fieldErrors?.password} />
          <p className="mt-2 text-right text-[0.95rem]">
            <Link href="/forgot-password" className="font-semibold text-ink underline">
              Forgot your password?
            </Link>
          </p>
        </div>
        <SubmitButton className="w-full">Sign in</SubmitButton>
      </div>
    </form>
  )
}
