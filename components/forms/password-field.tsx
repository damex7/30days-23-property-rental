// CLIENT COMPONENT: the show/hide toggle and the live strength hint react
// to clicks and typing.
'use client'

import { useState, type ReactNode } from 'react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/validation'
import { describedBy, FieldError, fieldIds } from './field'
import { estimateStrength } from './strength'

type Props = {
  name: string
  label: string
  /** "current-password" for login / confirm checks, "new-password" when choosing one. */
  autoComplete: 'current-password' | 'new-password'
  errors?: string[]
  hint?: ReactNode
  /** Show the live strength meter (new passwords only). */
  showStrength?: boolean
  /** Words that make a weak password if included (the person's name and email). */
  userInputs?: string[]
}

/**
 * A password input with a show/hide button.
 *
 * - autocomplete="new-password" tells password managers to OFFER to
 *   generate and save one; "current-password" tells them to fill the saved one.
 * - The toggle is a real <button type="button"> (so it never submits the
 *   form) with aria-pressed, and its label says what it will do.
 * - The input is uncontrolled, so React's automatic form reset after a
 *   Server Action clears it: a password is never kept or sent back after an
 *   error. Forms give it key={state.submissionId}, which also resets the
 *   strength meter.
 */
export function PasswordField({ name, label, autoComplete, errors, hint, showStrength = false, userInputs = [] }: Props) {
  const [visible, setVisible] = useState(false)
  const [value, setValue] = useState('')
  const ids = fieldIds(name)
  const invalid = Boolean(errors?.length)
  const strength = showStrength ? estimateStrength(value, userInputs) : null
  const hasHint = Boolean(hint) || showStrength

  return (
    <div>
      <label htmlFor={ids.input} className="mb-1.5 block font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          id={ids.input}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          minLength={autoComplete === 'new-password' ? PASSWORD_MIN : undefined}
          maxLength={PASSWORD_MAX}
          // Stop phones "helpfully" capitalising or correcting a password.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy(name, hasHint, invalid)}
          className="field block min-h-12 w-full pr-14 pl-3.5 text-base"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-controls={ids.input}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-control text-muted hover:text-ink"
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} />
        </button>
      </div>

      {hasHint ? (
        <div id={ids.hint} className="mt-1.5 text-sm text-muted">
          {strength ? <StrengthMeter strength={strength} /> : null}
          {hint}
        </div>
      ) : null}
      <FieldError name={name} errors={errors} />
    </div>
  )
}

function StrengthMeter({ strength }: { strength: ReturnType<typeof estimateStrength> }) {
  return (
    <div className="mb-1">
      {/* Four segments filled in teal; the words carry the meaning, not the colour. */}
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn('h-1.5 flex-1 rounded-pill transition-colors', step <= strength.score ? 'bg-ink' : 'bg-rule')}
          />
        ))}
      </div>
      {/* aria-live: screen readers hear the new rating after a pause in typing. */}
      <p aria-live="polite" className="mt-1">
        <span className="font-semibold text-ink">{strength.label}</span>
        {strength.tip ? <span>. {strength.tip}</span> : null}
      </p>
    </div>
  )
}
