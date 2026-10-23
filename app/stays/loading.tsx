import { StayCardSkeleton } from '@/components/stays/stay-card'

/** While a search runs: the shape of the results, so nothing jumps when they arrive. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Searching" className="mx-auto w-full max-w-page px-4 py-6 sm:px-6">
      <div className="skeleton mb-5 h-20 w-full rounded-card" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <StayCardSkeleton key={i} />)}
      </div>
    </div>
  )
}
