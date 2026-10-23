import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon } from './icon'

/** The title block at the top of each page, with optional actions on the right and a back link above. */
export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back ? (
        <Link href={back.href} className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-muted no-underline hover:text-ink hover:underline">
          <Icon name="arrowLeft" className="size-4" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[2rem] sm:text-4xl">{title}</h1>
          {description ? <div className="mt-1.5 max-w-3xl text-muted">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}

/** A labelled section on a raised sheet. */
export function Sheet({ title, children, id, className = '', actions }: { title?: ReactNode; children: ReactNode; id?: string; className?: string; actions?: ReactNode }) {
  return (
    <section aria-labelledby={title && id ? `${id}-title` : undefined} className={`rounded-card border border-rule bg-card p-4 shadow-card sm:p-6 ${className}`}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id={id ? `${id}-title` : undefined} className="text-2xl">
            {title}
          </h2>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  )
}
