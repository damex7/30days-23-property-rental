/** The listing page while it loads: the same shape, so nothing jumps when it arrives. */
export function ListingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the listing" className="mx-auto w-full max-w-page px-4 py-6 sm:px-6 sm:py-8">
      <div className="skeleton h-4 w-48" />
      <div className="skeleton mt-3 h-10 w-3/4" />
      <div className="skeleton mt-3 h-4 w-1/2" />
      <div className="skeleton mt-5 aspect-[4/3] w-full rounded-card sm:aspect-[16/9]" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-3">
          <div className="skeleton h-7 w-56" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-11/12" />
          <div className="skeleton h-4 w-4/5" />
        </div>
        <div className="skeleton h-72 w-full rounded-card" />
      </div>
    </div>
  )
}
