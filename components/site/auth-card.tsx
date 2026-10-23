import type { ReactNode } from 'react'
import { Mark } from '@/components/brand/mark'

/** The centred card every sign-in page uses. */
export function AuthCard({ title, intro, children, footer }: { title: string; intro?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-form px-4 py-10 sm:py-14">
      <div className="panel">
        <div className="p-6 sm:p-9">
          <Mark className="mb-4 size-10 text-primary" />
          <h1 className="text-3xl">{title}</h1>
          {intro ? <div className="mt-2 text-muted">{intro}</div> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
      {footer ? <div className="mt-6 text-center text-[0.95rem] [&_a]:font-semibold [&_a]:text-ink [&_a]:underline">{footer}</div> : null}
    </div>
  )
}

/** Placeholder while a card's request-dependent part streams in. */
export function FormSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="skeleton h-5 w-32" />
      <div className="skeleton h-12 w-full" />
      <div className="skeleton h-5 w-24" />
      <div className="skeleton h-12 w-full" />
      <div className="skeleton h-11 w-full" />
    </div>
  )
}
