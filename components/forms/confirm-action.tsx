// CLIENT COMPONENT: it opens a dialog and manages focus.
'use client'

import { useActionState, useEffect, useId, useRef, type ReactNode } from 'react'
import { button } from '@/components/ui/button'
import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import type { FormState } from '@/lib/validation'
import { SubmitButton } from './submit-button'

type Action = (state: FormState, formData: FormData) => Promise<FormState>

/**
 * A button that asks first: Cancel an order, Delete, Archive, Deactivate.
 *
 * It uses a native <dialog> opened with showModal(), which:
 * - TRAPS FOCUS inside the dialog and makes the page behind it inert,
 *   so keyboard and screen-reader users can't wander off behind it;
 * - closes on Escape.
 * Focus goes to the SAFE choice ("Cancel") when it opens, so a stray Enter
 * changes nothing, and is RETURNED to the button that opened it when it
 * closes (done explicitly below, rather than trusting every browser).
 *
 * The Server Action's answer appears INSIDE the dialog (role="alert") when
 * it refuses, e.g. "this product has orders, so it can't be
 * deleted", together with an "Archive instead" button when the action
 * offers one. A success closes the dialog and is announced beside the button.
 */
export function ConfirmAction({
  action,
  fields,
  trigger,
  icon,
  triggerVariant = 'small',
  title,
  body,
  confirmLabel,
  pendingLabel = 'Working…',
  danger = false,
  archiveAction,
  formExtra,
}: {
  action: Action
  fields: Record<string, string>
  trigger: string
  icon?: IconName
  triggerVariant?: keyof typeof button
  title: string
  body: ReactNode
  confirmLabel: string
  pendingLabel?: string
  danger?: boolean
  /** Offered when the main action refuses with offerArchive (a delete blocked by history). */
  archiveAction?: Action
  /** Extra fields inside the confirming form, e.g. an optional cancellation reason. */
  formExtra?: ReactNode
}) {
  const [state, formAction] = useActionState(action, { status: 'idle' } satisfies FormState)
  const [archiveState, archiveFormAction] = useActionState(archiveAction ?? (async () => ({ status: 'idle' }) satisfies FormState), { status: 'idle' } satisfies FormState)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const bodyId = useId()

  function close() {
    dialogRef.current?.close()
  }

  // A success closes the dialog. (A redirect from the action navigates away instead.)
  useEffect(() => {
    if (state.status === 'success' || archiveState.status === 'success') dialogRef.current?.close()
  }, [state.status, state.submissionId, archiveState.status, archiveState.submissionId])

  const done = archiveState.status === 'success' ? archiveState : state.status === 'success' ? state : null
  const refused = state.status === 'error' ? state : null

  return (
    <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <button ref={triggerRef} type="button" className={cn(button[triggerVariant], danger && triggerVariant === 'small' && 'border-2 border-ink')} onClick={() => dialogRef.current?.showModal()}>
        {icon ? <Icon name={icon} className="size-4" /> : null}
        {trigger}
      </button>
      <p role="status" className="text-sm font-semibold text-ink empty:sr-only">
        {done?.message ?? null}
      </p>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        // Return focus to the button that opened the dialog, however it closed.
        onClose={() => triggerRef.current?.focus()}
        // showModal() makes the page behind inert, but Tab can still leave
        // for the browser's own toolbar. Wrap it, so Tab from the last
        // control goes to the first (and Shift+Tab the other way).
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([type=hidden]), textarea, select')]
          const firstEl = focusable[0]
          const lastEl = focusable.at(-1)
          if (!firstEl || !lastEl) return
          if (event.shiftKey && document.activeElement === firstEl) {
            event.preventDefault()
            lastEl.focus()
          } else if (!event.shiftKey && document.activeElement === lastEl) {
            event.preventDefault()
            firstEl.focus()
          }
        }}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card border border-rule bg-card p-0 text-ink shadow-pop backdrop:backdrop-blur-[1px]"
      >
        <div className={cn('h-1.5', danger ? 'bg-ink' : 'bg-primary')} aria-hidden />
        <div className="p-6">
          <h2 id={titleId} className="text-2xl">
            {title}
          </h2>
          <div id={bodyId} className="mt-2 text-muted">
            {body}
          </div>

          {refused ? (
            <div role="alert" className="mt-4 rounded-control border-l-4 border-ink bg-card p-3 text-[0.95rem]">
              <p className="flex items-start gap-2 font-semibold text-ink">
                <Icon name="errorCircle" className="mt-0.5" />
                <span>
                  <span className="sr-only">Error: </span>
                  {refused.message}
                </span>
              </p>
              {refused.offerArchive && archiveAction ? (
                <form action={archiveFormAction} className="mt-3 pl-7">
                  {Object.entries(fields).map(([name, value]) => (
                    <input key={name} type="hidden" name={name} value={value} />
                  ))}
                  <input type="hidden" name="archived" value="true" />
                  <SubmitButton variant="secondary" pendingLabel="Archiving…">
                    <Icon name="archive" className="size-4" />
                    Archive instead
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          ) : null}

          <form action={formAction} className="mt-6 flex flex-col-reverse flex-wrap gap-2 sm:flex-row sm:justify-end">
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            {formExtra ? <div className="order-last w-full sm:order-first">{formExtra}</div> : null}
            {/* autoFocus: the SAFE choice gets focus when the dialog opens. */}
            <button type="button" autoFocus className={button.secondary} onClick={close}>
              Cancel
            </button>
            <SubmitButton variant={danger ? 'danger' : 'primary'} pendingLabel={pendingLabel}>
              {confirmLabel}
            </SubmitButton>
          </form>
        </div>
      </dialog>
    </div>
  )
}
