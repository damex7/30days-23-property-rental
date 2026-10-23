'use client'

import { useActionState } from 'react'
import { resendVerification, verifyEmail } from '@/app/(auth)/actions'
import { SubmitButton } from '@/components/forms/submit-button'
import { Notice } from '@/components/ui/notice'
import { cn } from '@/lib/cn'
import type { FormState } from '@/lib/validation'

/** The "Confirm my email" button on the page the email link opens. */
export function VerifyEmailForm({ token }: { token: string }) {
  const [state, action] = useActionState(verifyEmail, { status: 'idle' } satisfies FormState)
  return (
    <form action={action}>
      {state.status === 'error' ? (
        <Notice tone="danger" title={state.message ?? 'Something went wrong'} className="mb-5" live />
      ) : null}
      <input type="hidden" name="token" value={token} />
      <SubmitButton className="w-full">Confirm my email</SubmitButton>
    </form>
  )
}

/** "Send a new link": in the unverified banner and on /verify-email. */
export function ResendVerificationForm({ compact = false }: { compact?: boolean }) {
  const [state, action] = useActionState(resendVerification, { status: 'idle' } satisfies FormState)
  return (
    <form action={action} className={cn(compact ? 'flex flex-wrap items-center gap-x-3 gap-y-2' : 'space-y-4')}>
      <SubmitButton variant={compact ? 'small' : 'secondary'} pendingLabel="Sending…">
        Send a new link
      </SubmitButton>
      {/* role="status" via live: the result is announced without moving focus. */}
      <p role="status" className={cn('text-sm font-semibold', 'text-ink')}>
        {state.status !== 'idle' ? state.message : null}
      </p>
    </form>
  )
}
