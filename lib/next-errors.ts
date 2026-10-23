import { unstable_rethrow } from 'next/navigation'

/**
 * For catch blocks around request-time work: re-throws Next.js's own
 * control-flow signals (redirect, notFound, "stop, this part is dynamic")
 * so they keep working, and lets real errors through to the caller.
 *
 * The Neon driver wraps a failed fetch in its own NeonDbError. When Next.js
 * aborts a prerender, the signal is the wrapped error, so it's checked too.
 */
export function rethrowNextErrors(error: unknown): void {
  unstable_rethrow(error)
  if (error instanceof Error && 'sourceError' in error) unstable_rethrow(error.sourceError)
}
