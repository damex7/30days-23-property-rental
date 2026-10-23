import Link from 'next/link'
import { Suspense } from 'react'
import { Logo } from '@/components/brand/logo'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { getCurrentSession } from '@/lib/auth/dal'
import { rethrowNextErrors } from '@/lib/next-errors'
import { NavLinks, type NavItem } from './nav-links'
import { SignOutButton } from './sign-out-button'
import { ThemeToggle } from './theme-toggle'

/**
 * The header of every page: the logo, the links for whoever is signed in,
 * the theme toggle, and Sign in / Sign out. It reads the session, so it
 * streams in inside <Suspense>; the page never waits for it.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-rule bg-page">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 sm:px-6">
        <Logo />
        <Suspense fallback={<span className="skeleton block h-11 w-28 sm:w-80" />}>
          <SessionControls />
        </Suspense>
      </div>
    </header>
  )
}

async function SessionControls() {
  let current = null
  try {
    current = await getCurrentSession()
  } catch (error) {
    // A database problem shouldn't take the page down from the header: the
    // page's own error boundary will explain it.
    rethrowNextErrors(error)
    console.error('[header] Could not read the session:', error)
  }
  const role = current?.user.role
  const items: NavItem[] = [{ href: '/stays', label: 'Find a stay', icon: 'search' }]
  if (current) {
    items.push({ href: '/trips', label: 'Trips', icon: 'calendar' }, { href: '/saved', label: 'Saved', icon: 'heart' })
    items.push(role === 'host' || role === 'admin' ? { href: '/host', label: 'Host', icon: 'key' } : { href: '/host/start', label: 'Become a host', icon: 'key' })
    if (role === 'admin') items.push({ href: '/admin', label: 'Admin', icon: 'shield' })
  }
  return (
    <>
      <NavLinks items={items} />
      <div className="flex items-center gap-1">
        <ThemeToggle />
        {current ? (
          <SignOutButton />
        ) : (
          <Link href="/login" className={button.primary}>
            <Icon name="user" />
            Sign in
          </Link>
        )}
      </div>
    </>
  )
}
