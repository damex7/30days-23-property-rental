// GET /api/listings/<id>/quote?checkin=…&checkout=…&guests=…
// The booking panel's LIVE QUOTE: the server's pricing function, the same
// rules as Reserve, and nothing held. Read-only, so a GET is right.
import { NextResponse, type NextRequest } from 'next/server'
import { quoteSchema } from '@/lib/schemas'
import { quoteForListing } from '@/lib/services/bookings'
import { isServiceError } from '@/lib/services/errors'
import { getPageActor } from '@/lib/services/session-actor'

export async function GET(request: NextRequest, ctx: RouteContext<'/api/listings/[id]/quote'>) {
  const { id } = await ctx.params
  const parsed = quoteSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, problem: 'Choose a check-in and a check-out date.' }, { status: 400 })
  }
  try {
    const answer = await quoteForListing(await getPageActor(), id, { checkIn: parsed.data.checkin, checkOut: parsed.data.checkout, guests: parsed.data.guests })
    return NextResponse.json(answer, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (isServiceError(error)) return NextResponse.json({ ok: false, problem: error.message }, { status: error.status })
    throw error
  }
}
