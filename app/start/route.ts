// /start: "take me to MY page" (trips, the host dashboard or /admin). Places that only know someone
// is signed in (the password-reset redirect, the "continue" links on the
// login and verify pages) point here, and this forwards, keeping any ?notice=.
import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentSession, homePathFor } from '@/lib/auth/dal'

export async function GET(request: NextRequest) {
  const current = await getCurrentSession()
  const target = new URL(current ? homePathFor(current.user.role) : '/login', request.url)
  const notice = request.nextUrl.searchParams.get('notice')
  // Only a short slug is passed on; the page decides what (if anything) it means.
  if (notice && /^[a-z-]{1,40}$/.test(notice)) target.searchParams.set('notice', notice)
  return NextResponse.redirect(target, 303)
}
