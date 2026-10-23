import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/** The ids that tie a field to its hint and error, for aria-describedby. */
export function fieldIds(name: string) {
  return { input: name, hint: `${name}-hint`, error: `${name}-error` }
}

/** Joins the ids of whatever descriptions this field actually has. */
export function describedBy(name: string, hasHint: boolean, hasError: boolean): string | undefined {
  const ids = fieldIds(name)
  const parts = [hasHint && ids.hint, hasError && ids.error].filter(Boolean)
  return parts.length ? parts.join(' ') : undefined
}

/** The message(s) under a field. The id is what the input's aria-describedby points at. */
export function FieldError({ name, errors }: { name: string; errors?: string[] }) {
  if (!errors?.length) return null
  return (
    <p id={fieldIds(name).error} className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold text-ink">
      <span aria-hidden className="mt-px">✕</span>
      {/* "Error:" is for screen readers; sighted users have the ✕, the bold text, the dashed border and the position. */}
      <span>
        <span className="sr-only">Error: </span>
        {errors[0]}
      </span>
    </p>
  )
}

type TextFieldProps = {
  name: string
  label: string
  hint?: ReactNode
  errors?: string[]
  /** When the same form appears more than once on a page (an edit form per row), give each its own id. */
  id?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'id'>

/**
 * A labelled text input with an optional hint and an inline error.
 * - <label htmlFor> is linked to the input's id: clicking the label focuses
 *   it, and screen readers announce the label.
 * - aria-describedby points at the hint and the error, so both are read
 *   out when the field gets focus.
 * - aria-invalid marks it invalid for assistive tech (and gives it the
 *   crimson border in globals.css).
 */
export function TextField({ name, label, hint, errors, className, id, ...input }: TextFieldProps) {
  const ids = fieldIds(id ?? name)
  const invalid = Boolean(errors?.length)
  return (
    <div className={className}>
      <label htmlFor={ids.input} className="mb-1.5 block font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={ids.hint} className="-mt-1 mb-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <input
        id={ids.input}
        name={name}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(id ?? name, Boolean(hint), invalid)}
        className={cn('field block min-h-12 w-full px-3.5 text-base')}
        {...input}
      />
      <FieldError name={id ?? name} errors={errors} />
    </div>
  )
}

type SelectFieldProps = {
  name: string
  label: string
  hint?: ReactNode
  errors?: string[]
  children: ReactNode
  id?: string
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'name' | 'id' | 'children'>

/**
 * A native <select>, labelled and described like TextField. Native on
 * purpose: on a phone it opens the system picker (big, thumb-friendly,
 * searchable on some phones), and screen readers know it well.
 */
export function SelectField({ name, label, hint, errors, className, children, id, ...select }: SelectFieldProps) {
  const ids = fieldIds(id ?? name)
  const invalid = Boolean(errors?.length)
  return (
    <div className={className}>
      <label htmlFor={ids.input} className="mb-1.5 block font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={ids.hint} className="-mt-1 mb-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <select
        id={ids.input}
        name={name}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(id ?? name, Boolean(hint), invalid)}
        className="field block min-h-12 w-full px-3 text-base"
        {...select}
      >
        {children}
      </select>
      <FieldError name={id ?? name} errors={errors} />
    </div>
  )
}

type TextAreaFieldProps = {
  name: string
  label: string
  hint?: ReactNode
  errors?: string[]
  id?: string
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'name' | 'id'>

export function TextAreaField({ name, label, hint, errors, className, id, ...textarea }: TextAreaFieldProps) {
  const ids = fieldIds(id ?? name)
  const invalid = Boolean(errors?.length)
  return (
    <div className={className}>
      <label htmlFor={ids.input} className="mb-1.5 block font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={ids.hint} className="-mt-1 mb-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <textarea
        id={ids.input}
        name={name}
        rows={3}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(id ?? name, Boolean(hint), invalid)}
        className="field block w-full px-3.5 py-2.5 text-base"
        {...textarea}
      />
      <FieldError name={id ?? name} errors={errors} />
    </div>
  )
}

/**
 * A price typed in NAIRA. A ₦ sign sits inside the box; the keyboard on a
 * phone is the decimal pad (inputMode="decimal"). The server turns the
 * text into integer kobo (lib/money.ts parseNaira), never via a float.
 */
export function NairaField({ name, label, hint, errors, className, id, ...input }: TextFieldProps) {
  const ids = fieldIds(id ?? name)
  const invalid = Boolean(errors?.length)
  return (
    <div className={className}>
      <label htmlFor={ids.input} className="mb-1.5 block font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={ids.hint} className="-mt-1 mb-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center font-semibold text-muted">
          ₦
        </span>
        <input
          id={ids.input}
          name={name}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy(id ?? name, Boolean(hint), invalid)}
          className="field block min-h-12 w-full pr-3.5 pl-8 text-base tabular-nums"
          {...input}
        />
      </div>
      <FieldError name={id ?? name} errors={errors} />
    </div>
  )
}
