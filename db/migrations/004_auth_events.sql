-- 004: the audit log. Every sign-up, login, failure, logout, password change
-- and admin action leaves one row here. It answers "was that me?" on
-- /account/activity and "who changed this?" for an admin.
--
-- Rows are only ever INSERTed; nothing in the app updates or deletes them.
CREATE TABLE auth_events (
  -- A plain counting id is fine here: event ids never appear in URLs.
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Whose account the event is about. NULL when unknown (a failed login for
  -- an email with no account). SET NULL rather than CASCADE: when an
  -- account is deleted, the history stays (anonymised) for security review.
  user_id    uuid        NULL REFERENCES users (id) ON DELETE SET NULL,

  -- Who DID it, when that's someone else: the admin who changed a role or
  -- revoked sessions. NULL when the user acted on their own account.
  actor_id   uuid        NULL REFERENCES users (id) ON DELETE SET NULL,

  -- A fixed list, so a typo can't create a new kind of event no screen
  -- knows how to show.
  type       text        NOT NULL CHECK (type IN (
               'signed_up', 'email_verified', 'logged_in', 'login_failed', 'logged_out',
               'password_changed', 'password_reset_requested', 'password_reset',
               'session_revoked', 'role_changed', 'profile_updated', 'account_deleted'
             )),

  ip         text        NULL CHECK (length(ip) <= 64),
  user_agent text        NULL CHECK (length(user_agent) <= 512),

  -- Small details that differ per type, e.g. {"from": "user", "to": "admin"}.
  -- Never the email someone typed into a failed login: people sometimes
  -- type their password into the email box.
  metadata   jsonb       NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- /account/activity ("my recent events, newest first") and the admin
-- list's "last login" (the newest logged_in event per user) are both an
-- index range scan on this.
CREATE INDEX auth_events_user_created_idx ON auth_events (user_id, created_at DESC);

-- Pruning old events by age.
CREATE INDEX auth_events_created_at_idx ON auth_events (created_at);
