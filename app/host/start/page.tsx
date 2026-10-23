import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { BecomeHostForm } from '@/components/host/become-host-form'
import { FormSkeleton } from '@/components/site/auth-card'
import { button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { PageHeader } from '@/components/ui/page-header'
import { requirePageActor } from '@/lib/services/session-actor'

export const metadata: Metadata = { title: 'Become a host' }

/** Any signed-in guest can become a host here. Their listings still need an admin's approval. */
export default function StartHostingPage() {
  return (
    <div className="mx-auto w-full max-w-form px-4 py-10">
      <PageHeader title="List your place on Staybook" description="Hosting is free. A person checks every listing before it goes live; guests pay through Paystack." />
      <Suspense fallback={<FormSkeleton />}>
        <Start />
      </Suspense>
    </div>
  )
}

async function Start() {
  const actor = await requirePageActor()
  if (actor.role === 'host' || actor.role === 'admin') {
    return (
      <Notice tone="success" title="You’re already a host">
        <p className="mb-3">Add a new listing, or manage the ones you have.</p>
        <Link href="/host/listings/new" className={button.primary}>Add a listing</Link>
      </Notice>
    )
  }
  return (
    <div className="panel p-6">
      <ol className="mb-6 list-decimal space-y-1 pl-5 text-muted">
        <li>Describe the place, drop a pin and add photos.</li>
        <li>Set prices, house rules and amenities.</li>
        <li>Send it for review. We’ll email you when it’s live.</li>
      </ol>
      <BecomeHostForm phone={actor.phone} />
    </div>
  )
}
