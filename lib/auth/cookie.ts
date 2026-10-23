// THE SESSION COOKIE'S NAME AND FLAGS. Shared by lib/auth/session.ts (which
// sets and deletes the cookie) and proxy.ts (which only checks that it
// exists and refreshes its lifetime). Holds no secrets, so it isn't
// server-only, which keeps it importable from the proxy.

const isProduction = process.env.NODE_ENV === 'production'

/**
 * In production the name starts with "__Host-". Browsers only accept a
 * cookie with that prefix if it is Secure, has Path=/ and has NO Domain
 * attribute. So no other site, and no subdomain of ours, can plant or
 * overwrite it (a "cookie tossing" attack). In development the plain name is
 * used, because Safari refuses Secure cookies on http://localhost.
 */
export const SESSION_COOKIE = isProduction ? '__Host-staybook_session' : 'staybook_session'

/** Sessions last 30 days from the last renewal. */
export const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60

/** A session used in its last 15 days is pushed back out to 30 (sliding renewal). */
export const SESSION_RENEW_WITHIN_SECONDS = 15 * 24 * 60 * 60

/**
 * The flags, each one a separate protection:
 *
 * - httpOnly: JavaScript in the page can't read the cookie (document.cookie
 *   doesn't show it). If an attacker ever gets a script onto a page (XSS),
 *   they still can't copy the session token and use it elsewhere.
 * - secure: the browser only sends it over HTTPS, so nobody on the café
 *   Wi-Fi can read it in transit. Off in development (plain http://localhost).
 * - sameSite 'lax': the browser does NOT attach the cookie to requests that
 *   other sites make in the background (a hidden form POST, an image, a
 *   fetch). It still does on a normal link click, so arriving from an email
 *   or a search result keeps you signed in. That blocks most cross-site
 *   request forgery (CSRF). 'strict' would also drop it on link clicks, so
 *   every arrival from another site would look signed out.
 * - path '/': sent with every page on the site, not just one folder.
 * - maxAge: how long the BROWSER keeps it. The database's expires_at is what
 *   actually decides whether the session is valid.
 */
export function sessionCookieOptions(maxAgeSeconds = SESSION_LIFETIME_SECONDS) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  }
}
