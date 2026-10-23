import Link from 'next/link'
import { Mark } from './mark'

/** The key-and-ring mark in jacaranda, plus the name in the display face. */
export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="group mr-auto inline-flex min-h-11 items-center gap-2 rounded-control pr-2 text-ink no-underline">
      <Mark className="size-9 shrink-0 text-primary transition-transform group-hover:-rotate-6" />
      <span className="leading-none">
        <span className="block font-display text-[1.6rem] font-semibold text-primary">Staybook</span>
        <span className="rubric block text-[0.6rem] max-[380px]:hidden">short-lets, kept properly</span>
      </span>
    </Link>
  )
}
