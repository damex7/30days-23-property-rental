import Link from 'next/link'
import { Mark } from '@/components/brand/mark'
import { button } from '@/components/ui/button'

/**
 * The body of every 404: unknown URLs, and a listing or booking that
 * doesn't exist OR isn't yours. The two look the same on purpose: saying
 * "that belongs to someone else" would confirm the id is real.
 */
export function NotFoundContent() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <Mark className="mb-5 size-16 text-primary" />
      <p className="rubric">404 · Not found</p>
      <h1 className="mt-1 text-4xl">There’s no room at this address</h1>
      <p className="mt-3 max-w-sm text-muted">The link may be mistyped, or the listing or booking isn’t available to you.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/stays" className={button.primary}>
          Find a stay
        </Link>
        <Link href="/" className={button.secondary}>
          Home
        </Link>
      </div>
    </div>
  )
}
