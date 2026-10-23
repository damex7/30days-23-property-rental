import type { ReactNode } from 'react'
import { Mark } from '@/components/brand/mark'

/** A calm message for an empty list, on a sunken concrete panel, with what to do next. */
export function EmptyState({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-edge bg-sunken px-6 py-12 text-center">
      <Mark className="mb-4 size-14 text-primary" />
      <h2 className="text-xl">{title}</h2>
      {children ? <div className="mt-2 max-w-md text-muted [&_a]:font-semibold [&_a]:text-primary [&_a]:underline">{children}</div> : null}
      {actions ? <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  )
}
