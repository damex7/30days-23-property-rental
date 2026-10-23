// CLIENT COMPONENT: it opens and closes, moves focus, and listens for Escape.
'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

/**
 * THE FILTERS: a sidebar on a wide screen, a FULL-SCREEN SHEET on a phone.
 * The same form is rendered once (no duplicate ids) and only its frame
 * changes: below `lg` it's hidden until "Filters" is pressed, then it covers
 * the screen as a modal dialog. Escape or "Close" shuts it and focus goes
 * back to the button that opened it. Tab is kept inside while it's open.
 */
export function FilterPanel({ children, activeCount }: { children: ReactNode; activeCount: number }) {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const node = panel.current
    const openerNode = opener.current
    node?.querySelector<HTMLElement>('h2')?.focus()
    document.body.style.overflow = 'hidden'
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        return
      }
      if (event.key !== 'Tab' || !node) return
      const focusable = [...node.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled'))
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        last.focus()
        event.preventDefault()
      } else if (!event.shiftKey && document.activeElement === last) {
        first.focus()
        event.preventDefault()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      openerNode?.focus()
    }
  }, [open])

  return (
    <>
      <button ref={opener} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className={`${button.secondary} lg:hidden`}>
        <Icon name="filter" />
        Filters{activeCount > 0 ? ` (${activeCount})` : ''}
      </button>
      <div
        ref={panel}
        role={open ? 'dialog' : undefined}
        aria-modal={open || undefined}
        aria-labelledby={titleId}
        className={cn(open ? 'fixed inset-0 z-[600] flex flex-col overflow-y-auto bg-sunken' : 'max-lg:hidden', 'lg:static lg:block lg:bg-transparent')}
      >
        {open ? (
          <div className="flex items-center justify-between gap-2 border-b border-rule bg-card px-4 py-3">
            <h2 id={titleId} tabIndex={-1} className="text-2xl">Filters</h2>
            <button type="button" onClick={() => setOpen(false)} className={button.icon}>
              <Icon name="close" label="Close filters" />
            </button>
          </div>
        ) : (
          <h2 id={titleId} className="sr-only">Filters</h2>
        )}
        {/* The sheet is sunken concrete; the fields sit on a CARD inside it, where
            their #8A8891 border has the 3:1 contrast inputs need (2.8:1 on sunken). */}
        <div className={cn(open && 'flex-1 p-4')}>
          <div className={cn(open && 'rounded-card border border-rule bg-card p-4')}>{children}</div>
        </div>
      </div>
    </>
  )
}

/** The sort menu: changing it submits its form at once; without JavaScript, the Apply button does. */
export function SortSelect({ children }: { children: ReactNode }) {
  return (
    <div
      onChange={(event) => {
        const target = event.target
        if (target instanceof HTMLSelectElement) target.form?.requestSubmit()
      }}
    >
      {children}
    </div>
  )
}
