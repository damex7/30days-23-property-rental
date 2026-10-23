// CLIENT COMPONENT: it marks the CURRENT page, which needs usePathname().
// (It sits inside <Suspense> in the header, as Cache Components requires
// for anything that reads the URL during rendering.)
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

export type NavItem = { href: string; label: string; icon: IconName }

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/host/start' && pathname.startsWith(`${href}/`))
}

/**
 * The main links. aria-current="page" marks where you are, in words for
 * screen readers and with an underline for the eye. On a phone the row
 * wraps under the logo and scrolls sideways if it must, with icons AND
 * words, each at least 44px tall.
 */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Main" className="order-last w-full overflow-x-auto md:order-none md:w-auto">
      <ul className="flex items-center gap-0.5">
        {items.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-control px-2.5 text-[0.95rem] font-semibold no-underline transition-colors',
                  active ? 'text-primary underline decoration-2 underline-offset-[0.5em]' : 'text-muted hover:bg-selected hover:text-ink',
                )}
              >
                <Icon name={item.icon} className="size-4.5" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
