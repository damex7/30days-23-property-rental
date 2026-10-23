import { cn } from '@/lib/cn'

/**
 * "★ 4.80 (12)" in deep sand on concrete (sand as TEXT uses the darker tone,
 * 4.5:1 or more). The star is decorative; the words carry the meaning for
 * screen readers.
 */
export function Rating({ avg, count, className }: { avg: number | null; count: number; className?: string }) {
  if (avg === null || count === 0) {
    return <span className={cn('text-sm font-semibold text-muted', className)}>New</span>
  }
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm font-bold text-sand-ink figures', className)}>
      <svg viewBox="0 0 20 20" className="size-4" aria-hidden fill="currentColor">
        <path d="M10 1.8l2.4 5.2 5.7.6-4.3 3.9 1.2 5.6L10 14.3l-5 2.8 1.2-5.6L1.9 7.6l5.7-.6z" />
      </svg>
      <span className="sr-only">Rated</span>
      {avg.toFixed(2)}
      <span className="font-normal text-muted">
        ({count}
        <span className="sr-only"> {count === 1 ? 'review' : 'reviews'}</span>)
      </span>
    </span>
  )
}

/** "Guest favourite": 4.8+ from at least 3 reviews. A word, not just a colour. */
export function isGuestFavourite(avg: number | null, count: number): boolean {
  return avg !== null && avg >= 4.8 && count >= 3
}
