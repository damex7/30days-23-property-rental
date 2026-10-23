// GET /api/listings/<id>/calendar.ics?token=…  The host's availability feed.
//
// Calendar apps fetch this with no cookie, so the secret TOKEN in the URL
// is the only credential (lib/services/calendar.ts explains why it must be
// one). A wrong or missing token gets the same 404 as a listing that
// doesn't exist, so the feed can't be used to test which ids are real.
import type { NextRequest } from 'next/server'
import { icalFeed } from '@/lib/services/calendar'

export async function GET(request: NextRequest, ctx: RouteContext<'/api/listings/[id]/calendar.ics'>) {
  const { id } = await ctx.params
  const body = await icalFeed(id, request.nextUrl.searchParams.get('token') ?? '')
  if (!body) return new Response('Not found', { status: 404 })
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="staybook.ics"',
      // A secret-bearing URL: never cached by shared caches.
      'Cache-Control': 'private, max-age=300',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
