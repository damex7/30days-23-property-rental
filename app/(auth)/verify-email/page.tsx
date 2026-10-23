import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ResendVerificationForm, VerifyEmailForm } from '@/components/auth/verify-forms'
import { AuthCard, FormSkeleton } from '@/components/site/auth-card'
import { button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { getCurrentSession } from '@/lib/auth/dal'
import { checkEmailToken } from '@/lib/auth/tokens'
import { tokenSchema } from '@/lib/validation'

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false },
}

export default function VerifyEmailPage({ searchParams }: PageProps<'/verify-email'>) {
  return (
    <AuthCard title="Confirm your email">
      <Suspense fallback={<FormSkeleton />}>
        <VerifyContent searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  )
}

/**
 * Opening the link only LOOKS at the token and shows a button. Pressing the
 * button (a POST to the verifyEmail Server Action) is what uses it.
 */
async function VerifyContent({ searchParams }: Pick<PageProps<'/verify-email'>, 'searchParams'>) {
  const { token } = await searchParams
  const current = await getCurrentSession()
  const parsed = tokenSchema.safeParse(token)

  if (current?.user.emailVerifiedAt) {
    return (
      <>
        <Notice tone="success" title="Your email address is confirmed" />
        <Link href="/start" className={`${button.primary} mt-6 w-full`}>
          Continue
        </Link>
      </>
    )
  }

  if (parsed.success) {
    const check = await checkEmailToken(parsed.data, 'verify_email')
    if (check.status === 'valid') {
      return (
        <>
          <p className="mb-5">
            Confirm that <strong className="break-all">{check.email}</strong> is your email address.
          </p>
          <VerifyEmailForm token={parsed.data} />
        </>
      )
    }
    return <LinkProblem title={check.status === 'used' ? 'This link was already used' : check.status === 'expired' ? 'This link has expired' : 'This link isn’t valid'} signedIn={Boolean(current)} />
  }

  if (token !== undefined) return <LinkProblem title="This link isn’t valid" signedIn={Boolean(current)} />

  // No token at all: someone came here to request a new link.
  return current ? (
    <>
      <p className="mb-5">
        We sent a link to <strong className="break-all">{current.user.email}</strong>. Can’t find it? Check your spam folder, or send a new one.
      </p>
      <ResendVerificationForm />
    </>
  ) : (
    <SignInToResend />
  )
}

function LinkProblem({ title, signedIn }: { title: string; signedIn: boolean }) {
  return (
    <>
      <Notice tone="warning" title={title} className="mb-6">
        <p>Confirmation links work once, for 24 hours. Only the newest link you were sent works.</p>
      </Notice>
      {signedIn ? <ResendVerificationForm /> : <SignInToResend />}
    </>
  )
}

/**
 * Without a session we don't know whose address to send to, and asking for
 * an email here would reveal which addresses have accounts. So: sign in
 * first (unverified accounts can), then use the banner's "Send a new link".
 */
function SignInToResend() {
  return (
    <>
      <p>Sign in, then choose “Send a new link” in the banner at the top of the page.</p>
      <Link href="/login?next=/verify-email" className={`${button.primary} mt-6 w-full`}>
        Sign in
      </Link>
    </>
  )
}
