// INPUT RULES. Every value that arrives from a form passes through one of
// these Zod schemas before it touches the database. Types come from
// z.infer, so the rules and the TypeScript types can't drift apart.
//
// Not server-only: the limits are also used by the forms (maxLength,
// minLength) and the password strength hint in the browser. The browser's
// checks are only a convenience; the server always checks again here.
import { z } from 'zod'

export const PASSWORD_MIN = 8
// An upper limit matters for a password field: argon2 hashes whatever it is
// given, and a 10 MB "password" would tie up the server. 128 is far more
// than any passphrase needs.
export const PASSWORD_MAX = 128
export const NAME_MAX = 100
export const EMAIL_MAX = 254

const email = z
  .string({ error: 'Enter your email address' })
  .trim()
  .min(1, 'Enter your email address')
  .max(EMAIL_MAX, 'That email address is too long')
  .pipe(z.email('Enter an email address like ada@example.com'))

/** Reused by the admin forms. */
export const emailSchema = email

const name = z
  .string({ error: 'Enter your name' })
  .trim()
  .min(1, 'Enter your name')
  .max(NAME_MAX, `Use ${NAME_MAX} characters or fewer`)

/** A password being CHOSEN: the length policy applies. Never trimmed: spaces are allowed and count. */
const newPassword = z
  .string({ error: 'Choose a password' })
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Use ${PASSWORD_MAX} characters or fewer`)

/**
 * A password being CHECKED (login, "current password"): only "not empty"
 * and the hard upper limit. Applying the length policy here would turn a
 * wrong password into a different error message for no benefit.
 */
const existingPassword = z
  .string({ error: 'Enter your password' })
  .min(1, 'Enter your password')
  .max(PASSWORD_MAX, 'Email or password is incorrect')

/** A raw token from an email link: 32 random bytes as base64url = 43 characters. */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

export const signUpSchema = z.object({ name, email, password: newPassword })
export type SignUpInput = z.infer<typeof signUpSchema>

export const loginSchema = z.object({ email, password: existingPassword })
export type LoginInput = z.infer<typeof loginSchema>

export const emailOnlySchema = z.object({ email })
export type EmailOnlyInput = z.infer<typeof emailOnlySchema>

export const resetPasswordSchema = z.object({ token: tokenSchema, password: newPassword })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const verifyEmailSchema = z.object({ token: tokenSchema })

export const profileSchema = z.object({ name })
export type ProfileInput = z.infer<typeof profileSchema>

export const changePasswordSchema = z.object({
  currentPassword: existingPassword,
  newPassword,
})
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

/** Session ids are SHA-256 hashes in hex (see db/migrations/002). */
export const sessionIdSchema = z.object({ sessionId: z.string().regex(/^[0-9a-f]{64}$/) })

export const userIdSchema = z.object({ userId: z.uuid() })

// Staybook's three roles (db/migrations/006). A host is also a guest: they can
// book other people's places. Admins are made by npm run db:seed only.
export const ROLES = ['guest', 'host', 'admin'] as const
export const roleSchema = z.enum(ROLES)
export type Role = z.infer<typeof roleSchema>

/**
 * What every form's Server Action returns to useActionState.
 * - fieldErrors: messages shown under each field (linked with aria-describedby)
 * - values: what was typed, sent back so the form keeps it after an error.
 *   Passwords are NEVER sent back.
 * - submissionId: changes on every submit, so the error summary takes focus
 *   again even when the message is the same as last time.
 */
export type FormState<Field extends string = string> = {
  status: 'idle' | 'error' | 'success'
  message?: string
  fieldErrors?: Partial<Record<Field, string[]>>
  values?: Partial<Record<Field, string>>
  submissionId?: number
  /** A delete refused because bookings use it; the dialog offers "Archive instead". */
  offerArchive?: boolean
  /** Machine-readable extras from a ServiceError, e.g. the latest saved values after a stale edit. */
  details?: Record<string, unknown>
}

export const initialFormState: FormState = { status: 'idle' }

/** Turns a failed Zod parse into the FormState shape. */
export function invalid<Field extends string>(
  error: z.ZodError,
  values: Partial<Record<Field, string>>,
  message = 'Please fix the problems below.',
): FormState<Field> {
  const { fieldErrors } = z.flattenError(error)
  return {
    status: 'error',
    message,
    fieldErrors: fieldErrors as Partial<Record<Field, string[]>>,
    values,
    submissionId: Date.now(),
  }
}

/** A form-level error with no field to point at. */
export function failed<Field extends string>(message: string, values: Partial<Record<Field, string>> = {}): FormState<Field> {
  return { status: 'error', message, values, submissionId: Date.now() }
}

/** Reads one text field from FormData ('' when missing or a file). */
export function field(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}
