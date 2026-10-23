import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { DemoButtons } from '@/components/auth/demo-button'
import { LoginForm } from '@/components/auth/login-form'
import { AuthCard, FormSkeleton } from '@/components/site/auth-card'
import { button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { getCurrentSession } from '@/lib/auth/dal'

export const metadata: Metadata = { title: 'Sign in' }

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <AuthCard
      title="Sign in"
      footer={
        <p>
          <Link href="/forgot-password">Forgot your password?</Link>
        </p>
      }
    >
      {/* The URL and the cookie are only known per request, so this part streams in. */}
      <Suspense fallback={<FormSkeleton />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  )
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

async function LoginContent({ searchParams }: Pick<PageProps<'/login'>, 'searchParams'>) {
  const params = await searchParams
  const next = first(params.next) ?? null
  const reason = first(params.reason)
  const notice = first(params.notice)

  // Already signed in? Offer to carry on, rather than redirecting: the proxy
  // can't tell a valid cookie from a stale one, so the decision is made
  // here, where the database has actually been asked.
  const current = await getCurrentSession()

  return (
    <>
      {notice === 'verified' ? (
        <Notice tone="success" title="Email address confirmed" className="mb-6">
          <p>Thank you. Sign in to carry on.</p>
        </Notice>
      ) : null}
      {notice === 'signed-out' && !current ? (
        <Notice tone="success" title="You’re signed out" className="mb-6">
          <p>Your session was deleted on the server and the cookie removed from this browser.</p>
        </Notice>
      ) : null}
      {reason === 'ended' && !current ? (
        <Notice tone="info" title="Your session has ended" className="mb-6">
          <p>It expired or was signed out from another device. Please sign in again.</p>
        </Notice>
      ) : null}
      {current ? (
        <div className="mb-6 rounded-control border border-rule bg-page p-4">
          <p>
            You’re already signed in as <strong>{current.user.name}</strong>.
          </p>
          <Link href="/start" className={`${button.primary} mt-3`}>
            Continue
          </Link>
          <p className="mt-3 text-sm text-muted">Or sign in below as someone else.</p>
        </div>
      ) : null}
      <LoginForm next={next} />
      {/* The sign-up link carries ?next= too, so whoever followed a link to a page comes back to it. */}
      <p className="mt-6 border-t border-rule pt-5 text-center">
        New here?{' '}
        <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'} className="link">
          Create an account
        </Link>
      </p>
      <section aria-labelledby="demo-title" className="mt-6 border-t border-dashed border-edge pt-5">
        <h2 id="demo-title" className="text-2xl">
          Just looking?
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">Book as a demo guest (with the Paystack test card), or look around the shared read-only host desk. No email or password; demo guests are deleted after 24 hours.</p>
        <DemoButtons />
      </section>
    </>
  )
}
