// SAFE REDIRECTS for /login?next=…
//
// Without this check, a phishing email could link to
//   https://apo.example/login?next=https://evil.example/fake-login
// The person signs in on the REAL site, sees the real address bar, and is
// then sent to a lookalike page that says "wrong password, try again". That
// is an "open redirect". So `next` may only name a page on THIS site.

const FALLBACK = '/'

export function safeNextPath(next: string | null | undefined, fallback = FALLBACK): string {
  if (!next) return fallback
  // Must be a path: starts with exactly one "/". "//evil.example" is a
  // protocol-relative URL (it means https://evil.example), and some browsers
  // treat "/\evil.example" the same way.
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  // Resolve it against a dummy origin and confirm it stayed there. This
  // catches anything else that sneaks a host in (tabs and newlines, which
  // browsers strip, are included).
  try {
    const base = 'https://staybook.invalid'
    const url = new URL(next, base)
    if (url.origin !== base) return fallback
    // Never bounce back to the auth pages themselves.
    if (/^\/(login|signup|logout)(\/|$)/.test(url.pathname)) return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}
