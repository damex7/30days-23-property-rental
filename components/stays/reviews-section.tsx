import type { Review, ReviewAverages } from '@/lib/repos/reviews'
import { Rating } from './rating'

const SCORES: { key: keyof Omit<ReviewAverages, 'count'>; label: string }[] = [
  { key: 'cleanliness', label: 'Cleanliness' },
  { key: 'location', label: 'Location' },
  { key: 'value', label: 'Value' },
  { key: 'powerSupply', label: 'Power supply' },
]

/** Averages (from an aggregate query, lib/repos/reviews.ts) and the latest reviews with host replies. */
export function ReviewsSection({ averages, reviews }: { averages: ReviewAverages; reviews: Review[] }) {
  if (averages.count === 0) {
    return <p className="text-muted">No reviews yet. Stays here are new: be the first to say how it went.</p>
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Rating avg={averages.overall} count={averages.count} className="text-lg" />
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          {SCORES.map(({ key, label }) => {
            const value = averages[key] ?? 0
            return (
              <div key={key}>
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="flex items-center gap-2">
                  {/* A bar for the eye, the number for everyone. */}
                  <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-pill bg-sunken">
                    <span className="block h-full rounded-pill bg-primary" style={{ width: `${(value / 5) * 100}%` }} />
                  </span>
                  <span className="figures text-sm font-semibold">{value.toFixed(1)}</span>
                </dd>
              </div>
            )
          })}
        </dl>
      </div>
      <ul className="mt-6 grid gap-5 md:grid-cols-2">
        {reviews.map((r) => (
          <li key={r.id} className="border-t border-rule pt-4">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">{r.guestFirstName}</span>
              <span className="text-sm text-muted">stayed {r.stayMonth}</span>
              <span className="figures ml-auto text-sm font-bold text-sand-ink">
                {r.overall}/5<span className="sr-only"> overall</span>
              </span>
            </p>
            <p className="mt-1.5">{r.comment}</p>
            {r.hostReply ? (
              <div className="mt-3 border-l-2 border-primary pl-3 text-sm">
                <p className="font-semibold">The host replied</p>
                <p className="text-muted">{r.hostReply}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
