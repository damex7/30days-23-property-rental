// SENDING EMAIL. The rest of the app only ever calls sendEmail(); swapping
// Resend for another provider means changing this one file.
//
// - RESEND_API_KEY set: the email goes out through Resend's HTTP API (one
//   POST with fetch, so no SDK is needed).
// - Not set: the email, link included, is printed to the server console.
//   Handy in development: sign up, then copy the link from the terminal.
import 'server-only'

/** A file sent with the email. */
export type EmailAttachment = { filename: string; content: string; contentType: string }

export type Email = {
  to: string
  subject: string
  text: string
  html: string
  attachments?: EmailAttachment[]
  /**
   * Resend's Idempotency-Key: if the same key is sent twice within 24 hours
   * (a retried request, a cron job run twice), Resend sends the email once.
   */
  idempotencyKey?: string
}

const RESEND_TIMEOUT_MS = 8000

/**
 * The site's public address, used to build every link in every email.
 *
 * Never built from the request's Host header. An attacker can send a
 * "forgot password" request for YOUR email with "Host: evil.example"; if
 * the link were built from that header, the real email in your inbox would
 * point at their site and hand them your reset token when you click it
 * ("password reset poisoning").
 */
export function appUrl(path: string): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3023').replace(/\/+$/, '')
  return `${base}${path}`
}

/**
 * DEMO ACCOUNTS NEVER GET EMAIL (Day 20). Every demo address is
 * demo+<random>@example.com. Day 20 used the reserved ".invalid" domain,
 * and Paystack refused to start a transaction for it ("invalid email"),
 * so a demo guest couldn't pay. example.com is ALSO reserved (RFC 2606:
 * it will never have real inboxes) but has a valid shape, so Paystack
 * accepts it. Their emails are printed to the server log instead, so a
 * visitor's actions can't make the app send mail anywhere.
 */
export const DEMO_EMAIL_DOMAIN = 'example.com'

export function demoAddress(id: string): string {
  return `demo+${id}@${DEMO_EMAIL_DOMAIN}`
}

/** Any example.com address: the demo accounts, and the seed's accounts. Never really sent. */
export function isDemoAddress(address: string): boolean {
  return address.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`)
}

/** Sends an email. Never throws: a failed send is logged, and the caller carries on. */
export async function sendEmail(email: Email): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const demo = isDemoAddress(email.to)
  if (!apiKey || demo) {
    console.log(
      [
        '',
        demo ? '┌─ EMAIL (not sent: example.com address) ────────────────────' : '┌─ EMAIL (not sent: RESEND_API_KEY is not set) ─────────────',
        `│ To:      ${email.to}`,
        `│ Subject: ${email.subject}`,
        '│',
        ...email.text.split('\n').map((line) => `│ ${line}`),
        // Attachments are printed too, so they can be checked.
        ...(email.attachments ?? []).flatMap((file) => ['│', `│ ── Attachment: ${file.filename} (${file.contentType})`, ...file.content.split(/\r?\n/).filter(Boolean).map((line) => `│ ${line}`)]),
        '└────────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    )
    return true
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(email.idempotencyKey ? { 'Idempotency-Key': email.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? 'Staybook <onboarding@resend.dev>',
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        // Resend wants file contents as base64.
        attachments: email.attachments?.map((file) => ({
          filename: file.filename,
          content: Buffer.from(file.content, 'utf8').toString('base64'),
          content_type: file.contentType,
        })),
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Resend answered ${response.status}: ${await response.text()}`)
    return true
  } catch (error) {
    // The email address itself stays out of the logs.
    console.error(`[email] Sending "${email.subject}" failed:`, error instanceof Error ? error.message : error)
    return false
  }
}

// ---------------------------------------------------------------------------
// The messages
// ---------------------------------------------------------------------------

/** Escapes text placed into HTML, so a name like "<script>" is shown, not run. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

/**
 * The shared email frame in Staybook's colours: a concrete page, a warm white
 * card with a jacaranda rule across the top, graphite text and a jacaranda
 * button. Hex values here because most email apps ignore <style> blocks and
 * CSS variables: inline styles only.
 */
export function layout(heading: string, paragraphs: string[], button?: { label: string; url: string }): string {
  // A block that is already a table (a price breakdown) isn't wrapped in <p>.
  const body = paragraphs.map((p) => (p.startsWith('<table') ? p : `<p style="margin:0 0 16px;line-height:1.55">${p}</p>`)).join('')
  const cta = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#6A4FA3;color:#FFFFFF;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(button.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#5B5A63">Or paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(button.url)}</span></p>`
    : ''
  return `<!doctype html><html><body style="margin:0;background:#F3F2EF;font-family:system-ui,sans-serif;color:#26252D">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px">
      <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:22px;color:#6A4FA3">Staybook</p>
      <div style="background:#FCFBF9;border:1px solid #DAD8D2;border-top:4px solid #6A4FA3;border-radius:6px;padding:28px">
        <h1 style="margin:0 0 16px;font-size:20px;color:#26252D">${escapeHtml(heading)}</h1>${body}${cta}
      </div>
      <p style="margin:24px 0 0;font-size:12px;color:#5B5A63">You're receiving this because of an action on a Staybook account. If it wasn't you, you can ignore it.</p>
    </div></body></html>`
}

/** A two-column table (a price breakdown) for an email body. The last row is the bold total. */
export function emailTable(rows: [string, string][]): string {
  const cells = rows
    .map(([label, value], i) => {
      const style = i === rows.length - 1 ? 'padding:8px 0;font-weight:700;border-top:1px solid #DAD8D2' : 'padding:4px 0'
      return `<tr><td style="${style}">${escapeHtml(label)}</td><td style="${style};text-align:right">${escapeHtml(value)}</td></tr>`
    })
    .join('')
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:15px">${cells}</table>`
}

export function verifyEmailMessage(to: string, name: string, token: string): Email {
  const url = appUrl(`/verify-email?token=${token}`)
  return {
    to,
    subject: 'Confirm your email address',
    text: `Hello ${name},\n\nPlease confirm your email address by opening this link:\n${url}\n\nThe link works once and expires in 24 hours.`,
    html: layout(
      'Confirm your email address',
      [`Hello ${escapeHtml(name)},`, 'Please confirm this is your email address. The link works once and expires in 24 hours.'],
      { label: 'Confirm my email', url },
    ),
  }
}

export function resetPasswordMessage(to: string, name: string, token: string): Email {
  const url = appUrl(`/reset-password?token=${token}`)
  return {
    to,
    subject: 'Reset your password',
    text: `Hello ${name},\n\nSomeone (hopefully you) asked to reset your password. Open this link to choose a new one:\n${url}\n\nThe link works once and expires in 30 minutes. If you didn't ask for this, ignore this email: your password hasn't changed.`,
    html: layout(
      'Reset your password',
      [
        `Hello ${escapeHtml(name)},`,
        'Someone (hopefully you) asked to reset your password. The link works once and expires in 30 minutes.',
        "If you didn't ask for this, ignore this email: your password hasn't changed.",
      ],
      { label: 'Choose a new password', url },
    ),
  }
}


export function existingAccountMessage(to: string, name: string): Email {
  const login = appUrl('/login')
  const forgot = appUrl('/forgot-password')
  return {
    to,
    subject: 'You already have an account',
    text: `Hello ${name},

Someone (hopefully you) tried to create a new account with this email address, but you already have one.

Sign in: ${login}
Forgot your password? ${forgot}

If it wasn't you, you can ignore this email.`,
    html: layout(
      'You already have an account',
      [
        `Hello ${escapeHtml(name)},`,
        'Someone (hopefully you) tried to create a new account with this email address, but you already have one.',
        `Forgot your password? <a href="${escapeHtml(forgot)}" style="color:#31487A">Reset it here</a>.`,
      ],
      { label: 'Sign in', url: login },
    ),
  }
}

