import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { AuthCard, FormSkeleton } from '@/components/site/auth-card'
import { button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { checkEmailToken } from '@/lib/auth/tokens'
import { tokenSchema } from '@/lib/validation'

export const metadata: Metadata = {
  title: 'Choose a new password',
  // A page whose URL holds a secret has no business in a search index.
  robots: { index: false },
}

export default function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  return (
    <AuthCard title="Choose a new password">
      <Suspense fallback={<FormSkeleton />}>
        <ResetContent searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  )
}

/**
 * The token is checked BEFORE the form is shown, so nobody types a new
 * password only to be told the link had expired. This check doesn't use
 * the token up; the Server Action checks again and uses it atomically.
 */
async function ResetContent({ searchParams }: Pick<PageProps<'/reset-password'>, 'searchParams'>) {
  const { token } = await searchParams
  const parsed = tokenSchema.safeParse(token)
  const check = parsed.success ? await checkEmailToken(parsed.data, 'reset_password') : ({ status: 'invalid' } as const)

  if (check.status !== 'valid' || !parsed.success) {
    const title = check.status === 'used' ? 'This link was already used' : check.status === 'expired' ? 'This link has expired' : 'This link isn’t valid'
    return (
      <>
        <Notice tone="warning" title={title}>
          <p>Reset links work once, for 30 minutes. Request a new one and use the newest email.</p>
        </Notice>
        <Link href="/forgot-password" className={`${button.primary} mt-6 w-full`}>
          Request a new link
        </Link>
      </>
    )
  }

  return (
    <>
      <p className="mb-5 text-muted">
        For <strong className="break-all text-ink">{check.email}</strong>.
      </p>
      <ResetPasswordForm token={parsed.data} email={check.email} name={check.name} />
    </>
  )
}
