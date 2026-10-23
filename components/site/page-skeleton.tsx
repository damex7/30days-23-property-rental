/** A calm placeholder while a signed-in page waits for the database. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6">
      <div className="skeleton h-9 w-64 max-w-full" />
      <div className="skeleton h-5 w-96 max-w-full" />
      <div className="skeleton h-48 w-full rounded-card" />
      <div className="skeleton h-32 w-full rounded-card" />
    </div>
  )
}

/** A placeholder shaped like a filter bar and a table: for the admin lists. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <div className="skeleton h-10 w-56 max-w-full" />
      <div className="skeleton h-5 w-96 max-w-full" />
      <div className="skeleton h-28 w-full rounded-card" />
      <div className="overflow-hidden rounded-card border border-rule">
        <div className="skeleton h-11 rounded-none" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex gap-4 border-t border-rule px-3 py-3">
            <div className="skeleton h-4 flex-[3]" />
            <div className="skeleton h-4 flex-1" />
            <div className="skeleton h-4 flex-1" />
            <div className="skeleton h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  )
}
