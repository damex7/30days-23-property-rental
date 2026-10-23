// EMAILS about bookings and listings, each sent ONCE (Day 22's "claim then
// send"): a row in email_log (kind, subject) is claimed first; a retried
// callback, a webhook racing the callback, or a cron run twice finds the
// claim and sends nothing. If the send fails, the claim is released so a
// later attempt can try again. Without RESEND_API_KEY (and for every
// example.com address) emails are printed to the terminal instead.
import 'server-only'

import { appUrl, emailTable, escapeHtml, layout, sendEmail, type Email } from '@/lib/auth/email'
import { http } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { formatClock } from '@/lib/format'
import { formatNaira } from '@/lib/money'
import { summariseNights } from '@/lib/pricing'
import * as paymentsRepo from '@/lib/repos/payments'
import * as staysRepo from '@/lib/repos/stays'
import { formatLong, formatRange } from '@/lib/time'

type Kind = 'booking_confirmed_guest' | 'booking_confirmed_host' | 'booking_cancelled_guest' | 'booking_cancelled_host' | 'review_reminder' | 'listing_rejected' | 'listing_approved' | 'payment_unhonoured'

async function claimAndSend(kind: Kind, subjectId: string, email: Email): Promise<boolean> {
  const claim = await paymentsRepo.claimEmail(http, kind, subjectId, email.to)
  if (claim === null) return false
  const ok = await sendEmail({ ...email, idempotencyKey: `${kind}-${subjectId}` })
  if (!ok) await paymentsRepo.releaseEmailClaim(http, claim)
  return ok
}

async function hostOf(hostId: string): Promise<{ email: string; name: string } | null> {
  const rows = await http.query(q`SELECT email::text AS email, name FROM users WHERE id = ${hostId}`)
  const row = rows[0]
  return row ? { email: String(row.email), name: String(row.name) } : null
}

function priceRows(stay: staysRepo.StayDetail): [string, string][] {
  const rows: [string, string][] = summariseNights(stay.priceLines ?? []).map((g) => [`${g.label} nights: ${g.count} × ${formatNaira(g.kobo)}`, formatNaira(g.totalKobo)])
  if (stay.discountKobo) rows.push(['Weekly discount', `−${formatNaira(stay.discountKobo)}`])
  if (stay.cleaningFeeKobo) rows.push(['Cleaning fee', formatNaira(stay.cleaningFeeKobo)])
  rows.push(['Service fee', formatNaira(stay.serviceFeeKobo ?? 0)])
  if (stay.cautionDepositKobo) rows.push(['Caution deposit (refundable)', formatNaira(stay.cautionDepositKobo)])
  rows.push(['Total paid', formatNaira(stay.totalKobo ?? 0)])
  return rows
}

/**
 * "You're booked": the GUEST's copy has the exact address, the host's phone
 * and the check-in instructions. They come from getStayById, which only
 * fills them for a confirmed stay (the CASE in lib/repos/stays.ts).
 */
export async function sendConfirmationEmails(stayId: string): Promise<void> {
  const stay = await staysRepo.getStayById(http, stayId)
  if (!stay || stay.status !== 'confirmed' || !stay.guestEmail) return
  const tripUrl = appUrl(`/trips/${stay.id}`)
  const when = `${formatLong(stay.checkIn)} to ${formatLong(stay.checkOut)}`
  const arrival = [
    `Address: ${stay.addressLine ?? 'in your trip page'}`,
    `Check in from ${formatClock(stay.checkInTime)}, check out by ${formatClock(stay.checkOutTime)}.`,
    stay.hostPhone ? `Your host ${stay.hostFirstName}: ${stay.hostPhone}` : '',
    stay.checkinInstructions ? `Check-in instructions: ${stay.checkinInstructions}` : '',
  ].filter(Boolean)
  await claimAndSend('booking_confirmed_guest', stay.id, {
    to: stay.guestEmail,
    subject: `You’re booked: ${stay.listingTitle}, ${formatRange(stay.checkIn, stay.checkOut)}`,
    text: `Hello ${stay.guestName ?? ''},\n\nYour stay at ${stay.listingTitle} (${stay.listingArea}, ${stay.listingCity}) is confirmed for ${when}.\n\n${arrival.join('\n')}\n\nTotal paid: ${formatNaira(stay.totalKobo ?? 0)}\n\nYour trip: ${tripUrl}`,
    html: layout(
      'You’re booked',
      [
        `Your stay at <strong>${escapeHtml(stay.listingTitle)}</strong> is confirmed for ${escapeHtml(when)}.`,
        arrival.map((line) => escapeHtml(line)).join('<br>'),
        emailTable(priceRows(stay)),
      ],
      { label: 'Open your trip', url: tripUrl },
    ),
  })
  const host = await hostOf(stay.hostId)
  if (host) {
    await claimAndSend('booking_confirmed_host', stay.id, {
      to: host.email,
      subject: `New booking: ${stay.listingTitle}, ${formatRange(stay.checkIn, stay.checkOut)}`,
      text: `Hello ${host.name},\n\n${stay.guestName ?? 'A guest'} booked ${stay.listingTitle} for ${when} (${stay.nightsCount} nights, ${stay.guestsCount} guests).\n\nTotal paid: ${formatNaira(stay.totalKobo ?? 0)}\n\n${appUrl('/host/bookings')}`,
      html: layout(
        'New booking',
        [
          `<strong>${escapeHtml(stay.guestName ?? 'A guest')}</strong> booked ${escapeHtml(stay.listingTitle)} for ${escapeHtml(when)}: ${stay.nightsCount} nights, ${stay.guestsCount} guest${stay.guestsCount === 1 ? '' : 's'}.`,
          emailTable(priceRows(stay)),
        ],
        { label: 'See your bookings', url: appUrl('/host/bookings') },
      ),
    })
  }
}

export async function sendCancellationEmails(stayId: string): Promise<void> {
  const stay = await staysRepo.getStayById(http, stayId)
  if (!stay || stay.status !== 'cancelled' || !stay.guestEmail) return
  const refunds = await paymentsRepo.refundsFor(http, stay.id)
  const refund = refunds.reduce((sum, r) => sum + r.amountKobo, 0)
  const when = formatRange(stay.checkIn, stay.checkOut)
  await claimAndSend('booking_cancelled_guest', stay.id, {
    to: stay.guestEmail,
    subject: `Cancelled: ${stay.listingTitle}, ${when}`,
    text: `Your booking at ${stay.listingTitle} for ${when} is cancelled.\n\n${refund > 0 ? `A refund of ${formatNaira(refund)} is on its way (pending).` : 'No refund is due under the cancellation policy.'}`,
    html: layout('Booking cancelled', [`Your booking at <strong>${escapeHtml(stay.listingTitle)}</strong> for ${escapeHtml(when)} is cancelled.`, refund > 0 ? `A refund of <strong>${formatNaira(refund)}</strong> has been recorded and is pending.` : 'No refund is due under the cancellation policy.']),
  })
  const host = await hostOf(stay.hostId)
  if (host) {
    await claimAndSend('booking_cancelled_host', stay.id, {
      to: host.email,
      subject: `Cancelled: ${stay.listingTitle}, ${when}`,
      text: `${stay.guestName ?? 'The guest'} cancelled their booking of ${stay.listingTitle} for ${when}. Those nights are open again.`,
      html: layout('A booking was cancelled', [`${escapeHtml(stay.guestName ?? 'The guest')} cancelled ${escapeHtml(stay.listingTitle)} for ${escapeHtml(when)}. Those nights are open again on your calendar.`]),
    })
  }
}

export async function sendReviewReminder(stayId: string): Promise<boolean> {
  const stay = await staysRepo.getStayById(http, stayId)
  if (!stay || stay.status !== 'completed' || stay.hasReview || !stay.guestEmail) return false
  const url = appUrl(`/trips/${stay.id}#review`)
  return claimAndSend('review_reminder', stay.id, {
    to: stay.guestEmail,
    subject: `How was ${stay.listingTitle}?`,
    text: `Thanks for staying at ${stay.listingTitle}. A short review helps the next guest (and tells them how the power supply really was): ${url}`,
    html: layout('How was your stay?', [`Thanks for staying at <strong>${escapeHtml(stay.listingTitle)}</strong>. A short review helps the next guest, and tells them how the power supply really was.`], { label: 'Leave a review', url }),
  })
}

export async function sendListingDecision(listing: { id: string; title: string; version: number; hostEmail: string; hostName: string }, decision: { approved: true } | { approved: false; reason: string }): Promise<void> {
  const subject = `${listing.id}:${listing.version}`
  if (decision.approved) {
    await claimAndSend('listing_approved', subject, {
      to: listing.hostEmail,
      subject: `Your listing is live: ${listing.title}`,
      text: `Hello ${listing.hostName},\n\n${listing.title} has been approved and guests can now book it.\n\n${appUrl('/host/listings')}`,
      html: layout('Your listing is live', [`<strong>${escapeHtml(listing.title)}</strong> has been approved. Guests can now find and book it.`], { label: 'Your listings', url: appUrl('/host/listings') }),
    })
    return
  }
  await claimAndSend('listing_rejected', subject, {
    to: listing.hostEmail,
    subject: `Changes needed: ${listing.title}`,
    text: `Hello ${listing.hostName},\n\nThanks for listing ${listing.title}. Before it can go live, please change this:\n\n${decision.reason}\n\nEdit and resubmit: ${appUrl(`/host/listings/${listing.id}/edit`)}`,
    html: layout('A few changes before it goes live', [`Thanks for listing <strong>${escapeHtml(listing.title)}</strong>. Before it can go live, please change this:`, `<em>${escapeHtml(decision.reason)}</em>`], { label: 'Edit your listing', url: appUrl(`/host/listings/${listing.id}/edit`) }),
  })
}
