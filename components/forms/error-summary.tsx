// CLIENT COMPONENT: it moves keyboard focus, which only exists in the browser.
'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from '@/components/ui/icon'
import type { FormState } from '@/lib/validation'

/**
 * The box at the top of a form after a failed submit.
 *
 * It RECEIVES FOCUS on every failed submit (submissionId changes each
 * time, even if the message is the same). Screen reader users hear the
 * problem at once instead of wondering why nothing happened, and keyboard
 * users can follow the links straight to each field.
 *
 * `labels` maps field names to the label text, so the summary can say
 * "Email: Enter an email address like ada@example.com". `children` adds
 * more help inside the box, so it's read out together with the message.
 */
export function ErrorSummary({ state, labels, children }: { state: FormState; labels: Record<string, string>; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const show = state.status === 'error'

  useEffect(() => {
    if (show) ref.current?.focus()
  }, [show, state.submissionId])

  if (!show) return null

  const fieldErrors = Object.entries(state.fieldErrors ?? {}).filter(([, messages]) => messages?.length)

  return (
    <div
      ref={ref}
      tabIndex={-1}
      aria-labelledby="error-summary-title"
      className="mb-6 rounded-control border-2 border-double border-ink bg-card p-4 motion-safe:animate-rise"
    >
      <h2 id="error-summary-title" className="flex items-center gap-2 font-sans text-base font-bold text-ink">
        <Icon name="errorCircle" />
        {state.message ?? 'There is a problem'}
      </h2>
      {fieldErrors.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-9 text-sm">
          {fieldErrors.map(([name, messages]) => (
            <li key={name}>
              <a href={`#${name}`} className="font-semibold text-ink underline">
                {labels[name] ?? name}: {messages?.[0]}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {/* Extra help, e.g. the next open times after "that time was just taken". */}
      {children}
    </div>
  )
}
