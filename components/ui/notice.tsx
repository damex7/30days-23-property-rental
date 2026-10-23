import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon, type IconName } from './icon'

type Tone = 'success' | 'warning' | 'danger' | 'info'

const TONES: Record<Tone, { box: string; icon: string; name: IconName; word: string }> = {
  success: { box: 'border-success', icon: 'text-success', name: 'checkCircle', word: 'Success' },
  warning: { box: 'border-sand', icon: 'text-sand-ink', name: 'alert', word: 'Warning' },
  danger: { box: 'border-danger', icon: 'text-danger', name: 'errorCircle', word: 'Error' },
  info: { box: 'border-primary', icon: 'text-primary', name: 'info', word: 'Note' },
}

/**
 * A status message box. The functional colours (error, success) appear only
 * here, in small doses: on the left edge and the icon. Tone is ALSO shown by
 * the icon's shape and a hidden word ("Warning:") for screen readers, so
 * colour is never the only signal. `live` makes a message that appears
 * later get announced.
 */
export function Notice({ tone, title, children, className, live = false }: { tone: Tone; title: string; children?: ReactNode; className?: string; live?: boolean }) {
  const t = TONES[tone]
  return (
    <div role={live ? 'status' : undefined} className={cn('rounded-control border border-l-4 border-rule bg-card p-4', t.box, className)}>
      <p className="flex items-center gap-2 font-bold text-ink">
        <Icon name={t.name} className={t.icon} />
        <span>
          <span className="sr-only">{t.word}: </span>
          {title}
        </span>
      </p>
      {children ? <div className="mt-1.5 pl-7 text-[0.95rem] [&_a]:font-semibold [&_a]:text-primary [&_a]:underline">{children}</div> : null}
    </div>
  )
}
