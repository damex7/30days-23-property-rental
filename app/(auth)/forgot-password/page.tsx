import type { Metadata } from 'next'
import Link from 'next/link'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'
import { AuthCard } from '@/components/site/auth-card'

export const metadata: Metadata = { title: 'Forgot your password?' }

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      intro="Enter the email address you signed up with and we’ll send you a link to choose a new password."
      footer={
        <p>
          Remembered it? <Link href="/login">Sign in</Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  )
}
