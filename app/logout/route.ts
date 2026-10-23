// POST /logout: deletes this browser's session row AND its cookie.
//
// A ROUTE HANDLER, so none of the Server Action protections apply here
// automatically. Two of our own:
// - Only POST is exported. A GET (a link, an <img src="/logout"> on someone
//   else's page, a browser prefetch) gets 405 Method Not Allowed from
//   Next.js and signs nobody out.
// - isSameOrigin() is the CSRF check: a form on another site posting here
//   arrives with that site's Origin header and is refused with 403.
import { NextResponse } from 'next/server'
import { getRequestInfo, isSameOrigin } from '@/lib/auth/request'
import { endCurrentSession } from '@/lib/auth/session'

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return new NextResponse('Cross-site request refused.', { status: 403 })
  }

  await endCurrentSession(await getRequestInfo())

  // 303 See Other: "go and GET this page instead", so refreshing the page
  // afterwards doesn't repeat the POST.
  return NextResponse.redirect(new URL('/login?notice=signed-out', request.url), 303)
}
