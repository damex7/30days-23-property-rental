// ERROR BOUNDARY: if a query throws (the database is asleep, unreachable,
// or DATABASE_URL is wrong), this replaces the page content instead of
// crashing the app; the layout around it (header, tabs) stays.
'use client'

import { ErrorPanel } from '@/components/site/error-panel'

export default function ErrorBoundary(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel {...props} />
}
