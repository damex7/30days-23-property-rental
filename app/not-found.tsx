import type { Metadata } from 'next'
import { NotFoundContent } from '@/components/site/not-found-content'

export const metadata: Metadata = { title: 'Page not found' }

/** A URL that matches no route, or (via proxy.ts and the pages) someone else's listing or booking. */
export default function NotFound() {
  return <NotFoundContent />
}
