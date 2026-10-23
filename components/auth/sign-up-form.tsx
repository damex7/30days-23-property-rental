'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { signUp } from '@/app/(auth)/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { TextField } from '@/components/forms/field'
import { PasswordField } from '@/components/forms/password-field'
import { SubmitButton } from '@/components/forms/submit-button'
import { Notice } from '@/components/ui/notice'
import { EMAIL_MAX, NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, type FormState } from '@/lib/validation'

type Field = 'name' | 'email' | 'password'
const LABELS: Record<Field, string> = { name: 'Your name', email: 'Email address', password: 'Password' }

/**
 * noValidate turns off the browser's own pop-up bubbles, so every problem is
 * reported the same accessible way: the error summary (which takes focus)
 * plus a message under each field. The server checks everything anyway.
 */
export function SignUpForm({ next }: { next: string | null }) {
  const [state, action] = useActionState(signUp, { status: 'idle' } satisfies FormState<Field>)
  // The name and email typed so far, so the strength hint can warn about a
  // password that contains them.
  const [personal, setPersonal] = useState({ name: '', email: '' })

  if (state.status === 'success') {
    return (
      <Notice tone="success" title="Check your inbox" live>
        <p>
          We’ve sent an email to <strong className="break-all">{state.values?.email}</strong>. Open the link in it to confirm your address.
        </p>
        <p className="mt-2">
          You can <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}>sign in</Link> straight away. Confirm your email so booking confirmations reach you.
        </p>
      </Notice>
    )
  }

  return (
    <form
      action={action}
      noValidate
      onChange={(event) => {
        const input = event.target
        if (input instanceof HTMLInputElement && (input.name === 'name' || input.name === 'email')) {
          setPersonal((p) => ({ ...p, [input.name]: input.value }))
        }
      }}
    >
      <ErrorSummary state={state} labels={LABELS} />
      <div className="space-y-5">
        <TextField
          name="name"
          label={LABELS.name}
          autoComplete="name"
          required
          maxLength={NAME_MAX}
          defaultValue={state.values?.name}
          errors={state.fieldErrors?.name}
        />
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
        <PasswordField
          key={state.submissionId}
          name="password"
          label={LABELS.password}
          autoComplete="new-password"
          showStrength
          userInputs={[personal.name, personal.email]}
          hint={`${PASSWORD_MIN} to ${PASSWORD_MAX} characters. A few unrelated words make a strong, memorable password.`}
          errors={state.fieldErrors?.password}
        />
        <SubmitButton className="w-full">Create account</SubmitButton>
        <p className="text-center">
          Already have an account?{' '}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} className="font-semibold">
            Sign in
          </Link>
        </p>
      </div>
    </form>
  )
}
