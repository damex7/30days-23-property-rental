import Link from 'next/link'
import { Mark } from '@/components/brand/mark'
import { site } from '@/lib/site'

/** Graphite, the 25%: the one dark band, with concrete text on it. */
export function SiteFooter() {
  return (
    <footer className="mt-auto bg-footer text-on-footer">
      <div className="mx-auto grid max-w-page gap-6 px-4 py-10 sm:grid-cols-[1fr_auto] sm:px-6">
        <div className="flex items-start gap-3">
          <Mark className="size-10 shrink-0 text-on-footer" />
          <div>
            <p className="font-display text-xl">{site.name}</p>
            <p className="mt-1 max-w-md text-sm text-on-footer-muted">
              Short-lets in Lagos, Abuja, Port Harcourt and Ibadan. Every listing approved by a person; the exact address is shared only once you’ve booked.
            </p>
          </div>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-1 text-sm">
          <Link href="/stays" className="font-semibold text-on-footer underline">Find a stay</Link>
          <Link href="/host/start" className="font-semibold text-on-footer underline">List your place</Link>
          <a href="https://www.openstreetmap.org/copyright" className="text-on-footer-muted underline">Map data © OpenStreetMap contributors</a>
        </nav>
      </div>
    </footer>
  )
}
