import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import { LISTING_STEPS, STEP_LABELS, type ListingStep } from '@/lib/schemas'

/**
 * The form's PROGRESS: six steps, the current one marked with
 * aria-current="step" (read out as "current step"), finished ones with a
 * tick AND the word "done" for screen readers. Every step is a link: the
 * draft is saved after each one, so a host can jump back to any of them.
 */
export function StepNav({ listingId, current, done }: { listingId: string | null; current: ListingStep; done: Partial<Record<ListingStep, boolean>> }) {
  return (
    <nav aria-label="Listing steps" className="mb-6 overflow-x-auto">
      <ol className="flex min-w-max gap-1.5">
        {LISTING_STEPS.map((step, i) => {
          const active = step === current
          const label = (
            <>
              <span className={cn('grid size-6 place-items-center rounded-full text-xs font-bold', active ? 'bg-primary text-on-primary' : done[step] ? 'bg-range text-on-range' : 'bg-sunken text-muted')}>
                {done[step] && !active ? <Icon name="check" className="size-3.5" /> : i + 1}
              </span>
              {STEP_LABELS[step]}
              {done[step] ? <span className="sr-only"> (done)</span> : null}
            </>
          )
          const cls = cn('inline-flex min-h-11 items-center gap-2 rounded-pill border px-3 text-sm font-semibold no-underline', active ? 'border-primary text-ink' : 'border-rule text-muted hover:bg-selected')
          return (
            <li key={step}>
              {listingId ? (
                <Link href={`/host/listings/${listingId}/edit?step=${step}`} aria-current={active ? 'step' : undefined} className={cls}>{label}</Link>
              ) : (
                <span aria-current={active ? 'step' : undefined} className={cn(cls, !active && 'opacity-60')}>{label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
