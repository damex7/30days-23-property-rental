import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

/**
 * Signing out is a POST to /logout (app/logout/route.ts), never a link.
 * A GET link would let any other page sign you out by embedding it in an
 * <img src="/logout">, and browsers that prefetch links could sign you out
 * by accident. A plain HTML form: it works before JavaScript has loaded.
 */
export function SignOutButton({ withLabel = false }: { withLabel?: boolean }) {
  return (
    <form method="post" action="/logout">
      <button type="submit" className={`${button.secondary} px-3`}>
        <Icon name="logout" />
        {withLabel ? (
          <span>Sign out</span>
        ) : (
          <>
            <span className="hidden sm:inline">Sign out</span>
            <span className="sr-only sm:hidden">Sign out</span>
          </>
        )}
      </button>
    </form>
  )
}
