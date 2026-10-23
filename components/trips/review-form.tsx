'use client'

import { useActionState } from 'react'
import { ErrorSummary } from '@/components/forms/error-summary'
import { describedBy, FieldError, TextAreaField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { Notice } from '@/components/ui/notice'
import type { FormState } from '@/lib/validation'

const SCORES = [
  { name: 'overall', label: 'Overall' },
  { name: 'cleanliness', label: 'Cleanliness' },
  { name: 'location', label: 'Location' },
  { name: 'value', label: 'Value for money' },
  { name: 'powerSupply', label: 'Power supply' },
] as const

const LABELS: Record<string, string> = { overall: 'Overall', cleanliness: 'Cleanliness', location: 'Location', value: 'Value', powerSupply: 'Power supply', comment: 'Your review' }

/**
 * Five 1–5 scores as real radio groups (a <fieldset> with a <legend> each,
 * so a screen reader says "Power supply, 4 of 5"), and a comment. After an
 * error, the error summary takes focus and every value is kept.
 */
export function ReviewForm({ action, stayId }: { action: (state: FormState, formData: FormData) => Promise<FormState>; stayId: string }) {
  const [state, formAction] = useActionState(action, { status: 'idle' } satisfies FormState)
  if (state.status === 'success') {
    return (
      <Notice tone="success" title="Review published" live className="mt-3">
        <p>{state.message}</p>
      </Notice>
    )
  }
  return (
    <form action={formAction} className="mt-3 space-y-4" noValidate>
      <ErrorSummary state={state} labels={LABELS} />
      <input type="hidden" name="id" value={stayId} />
      {SCORES.map((score) => {
        const errors = state.fieldErrors?.[score.name]
        return (
          <fieldset key={score.name} id={score.name} aria-describedby={describedBy(score.name, false, Boolean(errors?.length))}>
            <legend className="mb-1 font-semibold">{score.label}</legend>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="relative">
                  <input type="radio" name={score.name} value={n} defaultChecked={state.values?.[score.name] === String(n)} className="peer sr-only" />
                  <span className="grid size-11 cursor-pointer place-items-center rounded-control border border-edge font-semibold peer-checked:border-primary peer-checked:bg-primary peer-checked:text-on-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary">
                    {n}
                  </span>
                  <span className="sr-only"> of 5</span>
                </label>
              ))}
            </div>
            <FieldError name={score.name} errors={errors} />
          </fieldset>
        )
      })}
      <TextAreaField name="comment" label="Your review" hint="What should the next guest know? How was the power, the water, the neighbourhood?" rows={4} maxLength={2000} defaultValue={state.values?.comment} errors={state.fieldErrors?.comment} />
      <SubmitButton pendingLabel="Publishing…">Publish review</SubmitButton>
    </form>
  )
}
