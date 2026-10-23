'use client'

import { useActionState } from 'react'
import { TextAreaField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import type { FormState } from '@/lib/validation'

export function ReplyForm({ action, reviewId }: { action: (state: FormState, formData: FormData) => Promise<FormState>; reviewId: string }) {
  const [state, formAction] = useActionState(action, { status: 'idle' } satisfies FormState)
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="id" value={reviewId} />
      <TextAreaField id={`reply-${reviewId}`} name="reply" label="Reply publicly" rows={2} maxLength={1000} defaultValue={state.values?.reply} errors={state.fieldErrors?.reply} />
      <div className="flex items-center gap-3">
        <SubmitButton variant="small" pendingLabel="Publishing…">Publish reply</SubmitButton>
        <p role="status" className="text-sm font-semibold empty:sr-only">{state.status === 'error' && !state.fieldErrors?.reply ? state.message : state.status === 'success' ? state.message : ''}</p>
      </div>
    </form>
  )
}
