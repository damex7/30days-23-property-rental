import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { SaveButton } from '@/components/stays/save-button'
import { StayCard, StayCardSkeleton } from '@/components/stays/stay-card'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { listMySaved } from '@/lib/services/saved'
import { requirePageActor } from '@/lib/services/session-actor'

export const metadata: Metadata = { title: 'Saved' }

export default function SavedPage() {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-8 sm:px-6">
      <PageHeader title="Saved places" description="Tap the heart on any stay to keep it here. Places that are paused or removed drop off by themselves." />
      <Suspense fallback={<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <StayCardSkeleton key={i} />)}</div>}>
        <Saved />
      </Suspense>
    </div>
  )
}

async function Saved() {
  const actor = await requirePageActor()
  const cards = await listMySaved(actor)
  if (cards.length === 0) {
    return (
      <EmptyState title="Nothing saved yet" actions={<Link href="/stays" className={button.primary}>Find a stay</Link>}>
        <p>Save places while you compare them, then book the one you like.</p>
      </EmptyState>
    )
  }
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <li key={card.id}>
          <StayCard card={card} href={`/stays/${card.slug}`} heart={<SaveButton listingId={card.id} saved title={card.title} signedIn />} />
        </li>
      ))}
    </ul>
  )
}
