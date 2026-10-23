import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { ActionButton } from '@/components/forms/action-button'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { TableSkeleton } from '@/components/site/page-skeleton'
import { StatusBadge } from '@/components/trips/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { formatNaira } from '@/lib/money'
import { getAdminOverview } from '@/lib/services/admin'
import { requireAdminActor } from '@/lib/services/session-actor'
import { formatRange, formatStamp } from '@/lib/time'
import { approveAction, rejectAction, suspendAction } from './actions'

export const metadata: Metadata = { title: 'Admin' }

export default function AdminPage() {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-8 sm:px-6">
      <PageHeader title="Admin" description="Listings waiting for review, hosts, every booking, and what the daily job did." />
      <Suspense fallback={<TableSkeleton />}>
        <Admin />
      </Suspense>
    </div>
  )
}

async function Admin() {
  const actor = await requireAdminActor()
  const { pending, hosts, bookings, cronRuns, audit } = await getAdminOverview(actor)
  return (
    <div className="space-y-10">
      <section aria-labelledby="queue">
        <h2 id="queue" className="mb-3 text-2xl">Waiting for review ({pending.length})</h2>
        {pending.length === 0 ? <EmptyState title="The queue is empty"><p>New listings appear here when hosts submit them.</p></EmptyState> : (
          <ul className="space-y-4">
            {pending.map((l) => (
              <li key={l.id} className="panel flex flex-col gap-4 p-4 sm:flex-row">
                <div className="relative aspect-[3/2] w-full shrink-0 overflow-hidden rounded-control bg-sunken sm:w-48">
                  {l.coverUrl ? <Image src={l.coverUrl} alt={l.coverAlt ?? ''} fill sizes="192px" className="object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="tag-sand inline-block px-2.5 py-0.5 text-xs">Pending review</span>
                  <h3 className="mt-1 font-sans text-lg font-semibold">{l.title}</h3>
                  <p className="text-sm text-muted">{l.area}, {l.city} · by {l.hostName} ({l.hostEmail}) · {l.photoCount} photos · submitted {l.submittedAt ? formatStamp(l.submittedAt) : '—'}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/admin/listings/${l.id}`} className="inline-flex min-h-9 items-center rounded-control border border-edge px-3 text-sm font-semibold text-ink no-underline hover:bg-selected">Review details</Link>
                    <ActionButton action={approveAction} fields={{ id: l.id }} pendingLabel="Approving…">Approve</ActionButton>
                    <ConfirmAction
                      action={rejectAction}
                      fields={{ id: l.id }}
                      trigger="Reject…"
                      title={`Send “${l.title}” back?`}
                      body={<p>Tell the host what to change. They get this by email and see it on the listing.</p>}
                      formExtra={
                        <div className="mt-3">
                          <label htmlFor={`reason-${l.id}`} className="mb-1 block font-semibold">Reason</label>
                          <textarea id={`reason-${l.id}`} name="reason" rows={3} minLength={10} maxLength={1000} required className="field w-full px-3 py-2" placeholder="The photos are too dark: please add daylight photos of the bedroom and bathroom." />
                        </div>
                      }
                      confirmLabel="Send back"
                      pendingLabel="Sending…"
                      danger
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="hosts">
        <h2 id="hosts" className="mb-3 text-2xl">Hosts</h2>
        <div className="overflow-x-auto rounded-card border border-rule bg-card">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Hosts and their listings</caption>
            <thead className="bg-sunken"><tr><th scope="col" className="px-3 py-2.5">Host</th><th scope="col" className="px-3 py-2.5">Listings</th><th scope="col" className="px-3 py-2.5">Status</th><th scope="col" className="px-3 py-2.5"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {hosts.map((h) => (
                <tr key={h.id} className="border-t border-rule">
                  <td className="px-3 py-2.5"><span className="font-semibold">{h.name}</span><span className="block text-muted">{h.email}</span></td>
                  <td className="px-3 py-2.5">{h.published} published of {h.listings}</td>
                  <td className="px-3 py-2.5">{h.suspendedAt ? <strong className="text-danger">Suspended</strong> : h.isDemo ? 'Demo (read-only)' : 'Active'}</td>
                  <td className="px-3 py-2.5 text-right">
                    {h.isDemo ? null : h.suspendedAt ? (
                      <ActionButton action={suspendAction} fields={{ id: h.id, suspend: 'false' }} pendingLabel="Lifting…">Lift suspension</ActionButton>
                    ) : (
                      <ConfirmAction action={suspendAction} fields={{ id: h.id, suspend: 'true' }} trigger="Suspend" title={`Suspend ${h.name}?`} body={<p>All of their published listings are paused at once, and they can’t publish or edit until you lift it. Confirmed bookings stand.</p>} confirmLabel="Suspend host" pendingLabel="Suspending…" danger />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="bookings">
        <h2 id="bookings" className="mb-3 text-2xl">All bookings (latest 50)</h2>
        <div className="overflow-x-auto rounded-card border border-rule bg-card">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Every booking, newest first</caption>
            <thead className="bg-sunken"><tr><th scope="col" className="px-3 py-2.5">Guest</th><th scope="col" className="px-3 py-2.5">Listing</th><th scope="col" className="px-3 py-2.5">Dates</th><th scope="col" className="px-3 py-2.5">Status</th><th scope="col" className="px-3 py-2.5 text-right">Total</th></tr></thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t border-rule">
                  <td className="px-3 py-2.5">{b.guestName}</td>
                  <td className="px-3 py-2.5">{b.listingTitle}</td>
                  <td className="px-3 py-2.5">{formatRange(b.checkIn, b.checkOut)}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={b.status} /></td>
                  <td className="px-3 py-2.5 text-right figures">{formatNaira(b.totalKobo ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="cron" className="panel p-5">
          <h2 id="cron" className="text-xl">Daily job runs</h2>
          {cronRuns.length === 0 ? <p className="mt-2 text-muted">No runs yet.</p> : (
            <ul className="mt-3 divide-y divide-rule text-sm">
              {cronRuns.map((r) => (
                <li key={r.id} className="py-2">
                  <span className="font-semibold">{r.ok === null ? 'Running' : r.ok ? 'OK' : 'Failed'}</span> · {r.job} · {formatStamp(r.startedAt)}
                  {r.summary ? <code className="mt-1 block break-all text-xs text-muted">{JSON.stringify(r.summary)}</code> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="audit" className="panel p-5">
          <h2 id="audit" className="text-xl">Audit log</h2>
          {audit.length === 0 ? <p className="mt-2 text-muted">No decisions yet.</p> : (
            <ul className="mt-3 divide-y divide-rule text-sm">
              {audit.map((a) => (
                <li key={a.id} className="py-2">
                  <span className="font-semibold">{a.action.replace(/_/g, ' ')}</span> · {a.listingTitle ?? a.targetName ?? ''} · by {a.actorName ?? 'someone'} · {formatStamp(a.createdAt)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
