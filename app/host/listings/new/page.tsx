import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BasicsForm } from '@/components/host/listing-forms'
import { StepNav } from '@/components/host/step-nav'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { Flash } from '@/components/ui/flash'
import { Notice } from '@/components/ui/notice'
import { PageHeader } from '@/components/ui/page-header'
import { firstValues } from '@/lib/schemas'
import { DEMO_READ_ONLY_MESSAGE } from '@/lib/services/actor'
import { requireHostPageActor } from '@/lib/services/session-actor'
import { createListingAction } from '../../actions'

export const metadata: Metadata = { title: 'New listing' }

/** Step 1 of 6. Saving it creates the DRAFT; the other steps then edit it. */
export default function NewListingPage({ searchParams }: PageProps<'/host/listings/new'>) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader back={{ href: '/host/listings', label: 'Your listings' }} title="New listing" description="Six short steps. Your progress is saved as a draft after each one." />
      <StepNav listingId={null} current="basics" done={{}} />
      <Suspense fallback={<PageSkeleton />}>
        <NewListing searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function NewListing({ searchParams }: Pick<PageProps<'/host/listings/new'>, 'searchParams'>) {
  const actor = await requireHostPageActor()
  const welcome = firstValues(await searchParams).notice === 'welcome'
  return (
    <>
      <Flash message={welcome ? 'Welcome, host! Let’s add your first place.' : null} />
      {actor.isDemo ? (
        <Notice tone="info" title="Read-only demo" className="mb-5">
          <p>{DEMO_READ_ONLY_MESSAGE}</p>
        </Notice>
      ) : null}
      <section aria-labelledby="basics" className="panel p-5 sm:p-6">
        <h2 id="basics" className="mb-4 text-2xl">The basics</h2>
        <BasicsForm action={createListingAction} />
      </section>
    </>
  )
}
