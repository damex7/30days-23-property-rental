import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import { STAY_STATUS_LABELS, type StayStatus } from '@/lib/options'

const STYLE: Record<StayStatus, { cls: string; icon: IconName }> = {
  held: { cls: 'tag-sand', icon: 'clock' },
  confirmed: { cls: 'bg-primary text-on-primary', icon: 'checkCircle' },
  completed: { cls: 'bg-sunken text-ink', icon: 'check' },
  cancelled: { cls: 'bg-sunken text-muted line-through decoration-1', icon: 'close' },
  expired: { cls: 'bg-sunken text-muted', icon: 'clock' },
}

/** A booking's status: an icon AND a word, never a colour alone. */
export function StatusBadge({ status }: { status: StayStatus }) {
  const s = STYLE[status]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-bold', s.cls)}>
      <Icon name={s.icon} className="size-3.5" />
      {STAY_STATUS_LABELS[status]}
    </span>
  )
}
