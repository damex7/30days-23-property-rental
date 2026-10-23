// SERVER ACTIONS for signing up, signing in, verifying an email and
// resetting a password, and the demo buttons. Sign-up always creates a
// 'guest'; admins are made by npm run db:seed.
//
// CSRF: Server Actions are protected by Next.js itself. They can only be
// called with POST, and Next.js compares the request's Origin header with
// the Host and refuses a mismatch, so a form on another site can't submit
// to them. Together with the SameSite=Lax session cookie, that is the CSRF
// protection; there's no token to add by hand. (Route handlers don't get
// this: see app/logout/route.ts.)
//
// Every action: 1) reads the form, 2) validates with Zod, 3) rate-limits,
// 4) does the work, 5) returns a FormState (or redirects).
'use server'

import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { getCurrentSession, homePathFor } from '@/lib/auth/dal'
import { fromServiceError } from '@/lib/action-helpers'
import { resetPasswordMessage, sendEmail, verifyEmailMessage } from '@/lib/auth/email'
import { recordEvent } from '@/lib/auth/events'
import { breachedMessage, checkBreachedPassword, hashPassword } from '@/lib/auth/password'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { getRequestInfo } from '@/lib/auth/request'
import { startSession } from '@/lib/auth/session'
import { createEmailToken } from '@/lib/auth/tokens'
import { safeNextPath } from '@/lib/safe-redirect'
import { signIn, signUp as signUpService } from '@/lib/services/auth'
import { startDemoGuest, startDemoHost } from '@/lib/services/demo'
import { isServiceError } from '@/lib/services/errors'
import { findUserByEmail, resetPasswordWithToken, verifyEmailWithToken } from '@/lib/users'
import {
  emailOnlySchema,
  failed,
  field,
  invalid,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
  verifyEmailSchema,
  type FormState,
} from '@/lib/validation'

/** Shown after "forgot password" whether or not the account exists. */
const RESET_SENT = 'If an active account exists for that address, we’ve sent a link to reset the password. It expires in 30 minutes.'

/** A password from a known breach: a field error with the reason. */
function breached<F extends string>(count: number, values: Partial<Record<F, string>>, fieldName: F): FormState<F> {
  return {
    status: 'error',
    message: 'Please choose a different password.',
    fieldErrors: { [fieldName]: [breachedMessage(count)] } as Partial<Record<F, string[]>>,
    values,
    submissionId: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// Sign up and log in, through lib/services/auth.ts: rate limits, no
// account enumeration, argon2id, session rotation.
// ---------------------------------------------------------------------------

type SignUpField = 'name' | 'email' | 'password'

export async function signUp(_previous: FormState<SignUpField>, formData: FormData): Promise<FormState<SignUpField>> {
  const values = { name: field(formData, 'name'), email: field(formData, 'email') }
  const parsed = signUpSchema.safeParse({ ...values, password: field(formData, 'password') })
  if (!parsed.success) return invalid(parsed.error, values)
  try {
    await signUpService(parsed.data, await getRequestInfo())
  } catch (error) {
    return fromServiceError(error, values)
  }
  return { status: 'success', values: { email: parsed.data.email }, submissionId: Date.now() }
}

type LoginField = 'email' | 'password'

export async function login(_previous: FormState<LoginField>, formData: FormData): Promise<FormState<LoginField>> {
  const values = { email: field(formData, 'email') }
  const parsed = loginSchema.safeParse({ ...values, password: field(formData, 'password') })
  if (!parsed.success) return invalid(parsed.error, values)
  let user
  try {
    user = await signIn(parsed.data, await getRequestInfo())
  } catch (error) {
    return fromServiceError(error, values)
  }
  redirect(safeNextPath(field(formData, 'next'), homePathFor(user.role)))
}

// ---------------------------------------------------------------------------
// Verify email
// ---------------------------------------------------------------------------

/**
 * The link in the email opens /verify-email, which shows a "Confirm"
 * button that posts here. Verifying on the GET itself would let email
 * scanners (which open every link to check it for malware) use up the
 * token, and it would break the app's rule that a GET never changes data.
 */
export async function verifyEmail(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = verifyEmailSchema.safeParse({ token: field(formData, 'token') })
  if (!parsed.success) return failed('This link isn’t valid. Check that you copied all of it.')

  const request = await getRequestInfo()
  const userId = await verifyEmailWithToken(parsed.data.token, request)
  if (!userId) return failed('This link has expired or was already used.')

  const current = await getCurrentSession()
  redirect(current?.user.id === userId ? '/start?notice=verified' : '/login?notice=verified')
}

/** "Send me a new link", from the banner on signed-in pages. */
export async function resendVerification(_previous: FormState, _formData: FormData): Promise<FormState> {
  const current = await getCurrentSession()
  if (!current) redirect('/login')
  const { user } = current
  if (user.emailVerifiedAt) return { status: 'success', message: 'Your email address is already confirmed.', submissionId: Date.now() }

  const request = await getRequestInfo()
  const limit = await checkRateLimit('resend', request.ip, user.id)
  if (!limit.ok) return failed(limit.message)

  const token = await createEmailToken(user.id, 'verify_email')
  const sent = await sendEmail(verifyEmailMessage(user.email, user.name, token))
  if (!sent) return failed('We couldn’t send the email just now. Please try again in a few minutes.')
  return { status: 'success', message: `We sent a new link to ${user.email}. It works for 24 hours.`, submissionId: Date.now() }
}

// ---------------------------------------------------------------------------
// Forgot and reset password
// ---------------------------------------------------------------------------

/**
 * Always answers "if an account exists, we've sent a link", and does the
 * real work (make a token, send the email, log it) in after(), once the
 * response has gone. So the answer and its timing are the same for
 * registered and unregistered addresses.
 */
export async function forgotPassword(_previous: FormState<'email'>, formData: FormData): Promise<FormState<'email'>> {
  const values = { email: field(formData, 'email') }
  const parsed = emailOnlySchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error, values)
  const { email } = parsed.data

  const request = await getRequestInfo()
  const limit = await checkRateLimit('forgot', request.ip, email)
  if (!limit.ok) return failed(limit.message, values)

  after(async () => {
    const user = await findUserByEmail(email)
    // Nothing is sent to a demo account either (same screen): it has no password to reset.
    if (!user || user.isDemo) return
    const token = await createEmailToken(user.id, 'reset_password')
    await sendEmail(resetPasswordMessage(user.email, user.name, token))
    await recordEvent({ type: 'password_reset_requested', userId: user.id, request })
  })

  return { status: 'success', message: RESET_SENT, values, submissionId: Date.now() }
}

/**
 * Sets a new password from a reset link. The token is checked again here
 * (and used up atomically by resetPasswordWithToken): the page's earlier
 * check only decided whether to show the form. Every existing session is
 * signed out, then this browser gets a fresh one.
 */
export async function resetPassword(_previous: FormState<'password'>, formData: FormData): Promise<FormState<'password'>> {
  const parsed = resetPasswordSchema.safeParse({ token: field(formData, 'token'), password: field(formData, 'password') })
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.path[0] === 'token')) return failed('This reset link isn’t valid. Please request a new one.')
    return invalid(parsed.error, {})
  }
  const { token, password } = parsed.data

  const breach = await checkBreachedPassword(password)
  if (breach.breached) return breached(breach.count, {}, 'password')

  const request = await getRequestInfo()
  const userId = await resetPasswordWithToken(token, await hashPassword(password), request)
  if (!userId) return failed('This reset link has expired or was already used. Please request a new one.')

  await startSession(userId, request, { type: 'logged_in', userId, request, metadata: { via: 'password_reset' } })
  redirect('/start?notice=password-reset')
}

// ---------------------------------------------------------------------------
// The demo buttons
// ---------------------------------------------------------------------------

/**
 * POSTs from the home page (never links: crawlers and WhatsApp link
 * previews follow links). The `as` field says which demo; anything else is
 * refused. Rate-limited per IP in the service. With DEMO_MODE off, the
 * service answers "not found".
 */
export async function tryDemo(_previous: FormState, formData: FormData): Promise<FormState> {
  const as = field(formData, 'as')
  if (as !== 'guest' && as !== 'host') return failed('Choose one of the two demos.')
  try {
    if (as === 'guest') await startDemoGuest(await getRequestInfo())
    else await startDemoHost(await getRequestInfo())
  } catch (error) {
    if (isServiceError(error)) return failed(error.message)
    throw error
  }
  redirect(as === 'guest' ? '/trips?notice=demo' : '/host?notice=demo')
}
