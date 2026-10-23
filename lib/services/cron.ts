// THE DAILY JOB (/api/cron/daily, scheduled in vercel.json). Every step is
// IDEMPOTENT: run it twice and the second run changes nothing, because each
// step is a guarded statement (only rows still in the old state move) or a
// claim (email_log, review_reminder_sent_at) that can only be taken once.
//
// TWO WAYS THE WORK HAPPENS (Day 20), and both are needed:
//   1. LAZILY when a relevant page loads: a listing page sweeps that
//      listing's expired holds; /trips and /host mark finished stays
//      completed; Reserve sweeps inside its own transaction; starting a demo
//      tidies old demo guests. Correct whenever anyone looks.
//   2. THIS CRON, once a day (Vercel's free plan runs crons at most daily):
//      for the rows nobody looks at, plus the review reminders.
import 'server-only'

import { http } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import * as adminRepo from '@/lib/repos/admin'
import { refreshRating } from '@/lib/repos/listings'
import * as staysRepo from '@/lib/repos/stays'
import { systemActor, type SystemActor } from './actor'
import { cleanupDemoGuests } from './demo'
import { sendReviewReminder } from './notifications'

/** Completed stays (from the last 14 days) whose guest hasn't reviewed and hasn't been reminded: claimed in the UPDATE, so each is reminded once. */
async function sendReviewReminders(): Promise<number> {
  const claimed = await http.query(q`
    UPDATE stays s SET review_reminder_sent_at = now()
    WHERE s.status = 'completed' AND s.kind = 'booking' AND s.review_reminder_sent_at IS NULL
      AND upper(s.nights) >= (now() AT TIME ZONE 'Africa/Lagos')::date - 14
      AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.stay_id = s.id)
    RETURNING s.id`)
  let sent = 0
  for (const row of claimed.slice(0, 200)) if (await sendReviewReminder(String(row.id))) sent++
  return sent
}

export async function runDaily(system: SystemActor = systemActor('Daily cron')): Promise<Record<string, number>> {
  const runId = await adminRepo.startCronRun(http, 'daily')
  try {
    const summary = {
      holds_expired: await staysRepo.expireStaleHolds(http),
      stays_completed: await staysRepo.completeFinishedStays(http),
      review_reminders_sent: await sendReviewReminders(),
      demo_guests_removed: await cleanupDemoGuests(system),
      // After the demo cleanup (their reviews went with them): recompute every cached rating from the reviews table.
      ratings_refreshed: await refreshRating(http, null),
      rate_limit_rows_purged: (await http.query(q`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day' RETURNING 1`)).length,
    }
    await adminRepo.finishCronRun(http, runId, true, summary)
    return summary
  } catch (error) {
    await adminRepo.finishCronRun(http, runId, false, { error: error instanceof Error ? error.message.slice(0, 200) : 'unknown' }).catch(() => {})
    throw error
  }
}
