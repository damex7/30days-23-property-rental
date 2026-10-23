// PROXY (Next.js 16's name for middleware): runs before every request.
// Three quick jobs, and deliberately not a fourth.
//
// 1. OPTIMISTIC REDIRECT: a signed-in page with NO session cookie at all
//    goes straight to /login?next=…. "Optimistic" because a cookie being
//    present proves nothing; the real check is in the DAL and the services.
//
// 2. COOKIE REFRESH: sliding renewal moves the session's expires_at in the
//    database, but pages can't write cookies while rendering, so the proxy
//    re-sends the same cookie with a fresh Max-Age on page loads.
//
// 3. AN HONEST 404 for /trips/<id> and /host/listings/<id> when that row
//    isn't yours (one indexed query, only on those URLs). Under Cache
//    Components a page's static frame has already started streaming with
//    200 before its notFound() can run, so the status code has to be
//    decided here (the Day 19/20 lesson). The page checks ownership again
//    itself and shows the same not-found screen.
//
// What it does NOT do: protect anything on its own. Pages and Server
// Actions check the session themselves, and every query filters on
// guest_id or host_id.
import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/cookie'
import { hashToken } from '@/lib/auth/tokens'
import { rowVisibility, type OwnedKind } from '@/lib/repos/visibility'

const PROTECTED_PREFIXES = ['/trips', '/saved', '/host', '/admin']

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

const UUID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'
const OWNED_PATHS: [RegExp, OwnedKind][] = [
  [new RegExp(`^/trips/${UUID}(?:/|$)`, 'i'), 'trips'],
  [new RegExp(`^/host/listings/${UUID}(?:/|$)`, 'i'), 'host-listings'],
]

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const isApi = pathname.startsWith('/api/')

  // CANONICAL SEARCH URLS: the filter form's checkboxes arrive as
  // ?amenity=wifi&amenity=pool; send the browser to ?amenities=wifi,pool, the
  // one shape the search page reads and people share.
  if (pathname === '/stays' && request.nextUrl.searchParams.has('amenity')) {
    const url = request.nextUrl.clone()
    const picked = url.searchParams.getAll('amenity')
    url.searchParams.delete('amenity')
    url.searchParams.delete('cursor')
    if (picked.length > 0) url.searchParams.set('amenities', picked.join(','))
    else url.searchParams.delete('amenities')
    return NextResponse.redirect(url, 303)
  }

  if (!isApi) {
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
      for (const [pattern, kind] of OWNED_PATHS) {
        const id = pattern.exec(pathname)?.[1]
        if (!id) continue
        const visibility = await rowVisibility(hashToken(token), kind, id.toLowerCase()).catch((error: unknown) => {
          // The page still checks ownership itself; only the status code is at stake here.
          console.error('[proxy] ownership check failed:', error)
          return 'visible' as const
        })
        if (visibility === 'hidden') {
          // Rewritten to a path with NO route, so Next.js renders
          // app/not-found.tsx with a genuine 404 status.
          return NextResponse.rewrite(new URL('/_not-yours', request.url))
        }
      }
    }

    if (isProtected(pathname) && !token) {
      const login = new URL('/login', request.url)
      login.searchParams.set('next', pathname + search)
      return NextResponse.redirect(login)
    }
  }

  // Pass the path on to the page (the DAL uses it for ?next= after login).
  // Always overwritten here, so a visitor can't supply it.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-staybook-path', pathname + search)
  const response = NextResponse.next({ request: { headers: requestHeaders } })

  if (!isApi && token && request.method === 'GET') {
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
  }
  return response
}

export const config = {
  // Every page and route, but not Next.js's own files or static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|seed/|.*\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)'],
}
