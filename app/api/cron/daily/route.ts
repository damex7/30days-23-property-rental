// GET /api/cron/daily: the scheduled job (vercel.json). Vercel Cron sends
// "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set on the
// project; anyone else gets 401. The comparison hashes both sides to the
// same length first, then compares in constant time, so the response time
// reveals nothing about how much of a guess was right.
import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { runDaily } from '@/lib/services/cron'

export const maxDuration = 60

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) return false
  const sent = createHash('sha256').update(request.headers.get('authorization') ?? '').digest()
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest()
  return timingSafeEqual(sent, expected)
}

export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: 'This route is for the scheduled job only.' }, { status: 401 })
  const summary = await runDaily()
  return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } })
}
