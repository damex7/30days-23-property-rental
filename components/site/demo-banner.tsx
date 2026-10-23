import { getCurrentSession } from '@/lib/auth/dal'
import { rethrowNextErrors } from '@/lib/next-errors'
import { TEST_CARD } from '@/lib/payments/paystack'
import { AnnounceOnce } from './announce-once'

/**
 * The slim banner on every page of a DEMO account. Part of the normal page
 * flow (not fixed), so on a 360px phone it pushes the page down instead of
 * covering it. "Exit demo" signs out (a POST, never a link).
 */
export async function DemoBanner() {
  let current = null
  try {
    current = await getCurrentSession()
  } catch (error) {
    rethrowNextErrors(error)
    return null
  }
  if (!current?.user.isDemo) return null
  const host = current.user.role === 'host'
  const message = host
    ? 'You’re looking around as the shared demo host. It’s read-only, and guests’ details are masked.'
    : 'You’re a private demo guest: book with the Paystack test card, nothing is emailed, and it’s all deleted after 24 hours.'
  return (
    <aside aria-label="Demo" className="border-b border-rule bg-sunken">
      <AnnounceOnce message={message} />
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm sm:px-6">
        <p className="min-w-0 flex-1 basis-64" aria-hidden>
          <span className="tag-sand mr-2 px-2 py-0.5 text-[0.7rem] uppercase">Demo</span>
          {message}
        </p>
        {!host ? (
          <details className="relative">
            <summary className="min-h-9 cursor-pointer content-center font-semibold text-primary underline">Test card</summary>
            <dl className="figures absolute right-0 z-[500] mt-1 grid w-64 grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-control border border-rule bg-raised p-3 text-xs shadow-pop max-sm:left-0 max-sm:right-auto">
              <dt className="text-muted">Card</dt>
              <dd>{TEST_CARD.number}</dd>
              <dt className="text-muted">Expiry</dt>
              <dd>{TEST_CARD.expiry}</dd>
              <dt className="text-muted">CVV</dt>
              <dd>{TEST_CARD.cvv}</dd>
              <dt className="text-muted">PIN</dt>
              <dd>{TEST_CARD.pin}</dd>
              <dt className="text-muted">OTP</dt>
              <dd>{TEST_CARD.otp}</dd>
            </dl>
          </details>
        ) : null}
        <form method="post" action="/logout">
          <button type="submit" className="inline-flex min-h-9 items-center rounded-control border border-edge bg-card px-3 font-semibold text-ink hover:bg-selected">
            Exit demo
          </button>
        </form>
      </div>
    </aside>
  )
}
