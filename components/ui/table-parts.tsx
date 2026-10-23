import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './icon'

/**
 * A SORTABLE COLUMN HEADER.
 * - `scope="col"` ties the header to its column for screen readers.
 * - `aria-sort` says which column the table is sorted by, and which way,
 *   only on that one column (the ARIA rule); the others have none.
 * - The control is a LINK to the same page with ?sort=&dir= changed: the
 *   sort lives in the URL, works without JavaScript, and the back button
 *   undoes it. Its hidden text says what clicking will do.
 */
export function SortHeader({
  label,
  active,
  dir,
  href,
  align = 'left',
  className,
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  href: string
  align?: 'left' | 'right'
  className?: string
}) {
  const nextDir = active && dir === 'asc' ? 'descending' : 'ascending'
  return (
    <th scope="col" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined} className={cn('px-3 py-2.5 font-semibold', align === 'right' ? 'text-right' : 'whitespace-nowrap', className)}>
      <Link href={href} scroll={false} className={cn('inline-flex items-center gap-1 rounded-control no-underline hover:underline', align === 'right' && 'flex-row-reverse')}>
        {label}
        <Icon name={active ? (dir === 'asc' ? 'sortAsc' : 'sortDesc') : 'sortNone'} className={cn('size-4', active ? 'text-primary' : 'text-muted')} />
        <span className="sr-only">, sort {nextDir}</span>
      </Link>
    </th>
  )
}

/** A plain header cell with the same look. */
export function Th({ children, align = 'left', className }: { children: ReactNode; align?: 'left' | 'right'; className?: string }) {
  return (
    <th scope="col" className={cn('px-3 py-2.5 font-semibold whitespace-nowrap', align === 'right' && 'text-right', className)}>
      {children}
    </th>
  )
}

/**
 * The frame around a data table: a raised sheet that scrolls sideways on
 * its own if the table is wider than the screen (never the whole page).
 * `relative` keeps screen-reader-only text inside from escaping the scroll
 * box, a Day 12 lesson. Canary (the triplicate copy) heads the columns,
 * and rows are separated by hairlines.
 */
export function TableFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-x-auto rounded-card border border-rule bg-card shadow-card',
        '[&_thead]:bg-selected [&_thead]:text-sm [&_tbody_tr]:border-t [&_tbody_tr]:border-rule [&_tbody_tr:hover]:bg-selected/60',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * PAGINATION as links (the page number is in the URL). "Page 2 of 7" is
 * plain text; Previous and Next are real links when they lead somewhere,
 * and visibly disabled text when they don't.
 */
export function Pagination({ page, total, pageSize, hrefFor, label = 'Pages' }: { page: number; total: number; pageSize: number; hrefFor: (page: number) => string; label?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const link = 'inline-flex min-h-11 items-center gap-1 rounded-control border border-edge bg-card px-3 font-semibold no-underline hover:bg-selected'
  const off = 'inline-flex min-h-11 items-center gap-1 rounded-control border border-rule px-3 text-muted'
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-2">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={link} rel="prev">
          <Icon name="chevronLeft" /> Previous
        </Link>
      ) : (
        <span className={off} aria-disabled="true">
          <Icon name="chevronLeft" /> Previous
        </span>
      )}
      <p className="text-sm text-muted tabular-nums">
        Page {Math.min(page, pages)} of {pages}
      </p>
      {page < pages ? (
        <Link href={hrefFor(page + 1)} className={link} rel="next">
          Next <Icon name="chevronRight" />
        </Link>
      ) : (
        <span className={off} aria-disabled="true">
          Next <Icon name="chevronRight" />
        </span>
      )}
    </nav>
  )
}
