// WHO IS ASKING: the IP address, browser and rough location of the current
// request. Used for rate limiting, the audit log and the sessions list.
import 'server-only'

import { headers } from 'next/headers'

export type RequestInfo = {
  ip: string
  userAgent: string | null
  /** A coarse label like "Lagos, NG". Never precise: it's only for "do I recognise this?". */
  location: string | null
}

/**
 * The visitor's IP address.
 *
 * On Vercel, x-forwarded-for is written by Vercel's own edge: the first
 * entry is the address that connected to it, and a visitor can't fake it.
 * (Vercel overwrites the header rather than appending to one the visitor
 * sent.) On a server with no proxy in front, ANYONE could send this header,
 * so an IP-based rate limit would be easy to dodge; there you would read
 * the socket address instead. Locally there is no header at all.
 */
function clientIp(h: Headers): string {
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || h.get('x-real-ip') || '127.0.0.1'
}

/**
 * Vercel adds the city and country it thinks the IP belongs to. City names
 * arrive URL-encoded ("S%C3%A3o%20Paulo"). Off Vercel there are no such
 * headers, so local development shows "Local network".
 */
function location(h: Headers): string | null {
  const country = h.get('x-vercel-ip-country')
  if (!country) return process.env.VERCEL ? null : 'Local network'
  let city = h.get('x-vercel-ip-city')
  try {
    city = city ? decodeURIComponent(city) : null
  } catch {
    city = null
  }
  return city ? `${city}, ${country}` : country
}

export async function getRequestInfo(): Promise<RequestInfo> {
  const h = await headers()
  return {
    ip: clientIp(h).slice(0, 64),
    userAgent: h.get('user-agent')?.slice(0, 512) ?? null,
    location: location(h)?.slice(0, 120) ?? null,
  }
}

/**
 * CSRF CHECK FOR ROUTE HANDLERS.
 *
 * Server Actions get this check from Next.js automatically: they only run
 * on POST, and Next.js compares the request's Origin header with the Host
 * and refuses a mismatch. A route handler (app/.../route.ts) gets NONE of
 * that, so any handler that changes data must check for itself.
 *
 * Browsers always send Origin on a cross-site POST and page scripts can't
 * change it, so evil.example posting a hidden form to /logout arrives with
 * "Origin: https://evil.example" and fails here. A request with no Origin at
 * all (very old browsers, or curl) is refused too: when in doubt, don't
 * change anything.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return host !== null && new URL(origin).host === host
  } catch {
    return false
  }
}
