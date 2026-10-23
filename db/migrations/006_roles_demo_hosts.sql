-- 006: Staybook's roles, demo accounts and the host's private phone number.
--
-- Migrations 001-005 are Day 17's auth tables, copied unchanged. Applied
-- migrations are history, so changes for this app go in a NEW file rather
-- than edits to the old ones: a database that already ran 001-005 ends up
-- exactly like a fresh one.

-- THREE ROLES instead of Day 17's two:
--   guest : everyone who signs up. Searches, books, reviews.
--   host  : a guest who pressed "Become a host" (/host/start). Hosts can
--           still book other people's places, so 'host' includes 'guest'.
--   admin : approves listings, suspends hosts. Made by npm run db:seed only.
-- The CHECK is replaced in three steps so no row is ever invalid: drop the
-- old rule, move existing rows over, add the new rule.
ALTER TABLE users DROP CONSTRAINT users_role_check;
UPDATE users SET role = 'guest' WHERE role = 'user';
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'guest';
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('guest', 'host', 'admin'));

ALTER TABLE users
  -- DEMO ACCOUNTS (the Day 20 pattern). "Try as a guest" makes a fresh,
  -- isolated demo guest per click; "Look around as a host" signs in to ONE
  -- shared demo host that the services keep read-only. A column rather
  -- than a magic email domain, so every rule asks one clear question.
  ADD COLUMN is_demo boolean NOT NULL DEFAULT false,

  -- The host's phone, shown ONLY to the guest of a confirmed booking (the
  -- location privacy rule in the README). Normalised to +234XXXXXXXXXX by
  -- the form, and the CHECK refuses anything else, so no query has to
  -- wonder whether it's "0803..." or "+234 803...".
  ADD COLUMN phone text NULL CHECK (phone IS NULL OR phone ~ '^\+234[0-9]{10}$'),

  -- SUSPENSION (by an admin): the host's listings are paused in the same
  -- transaction, and the services refuse a suspended host's writes. A
  -- timestamp rather than a boolean: it records WHEN, for the audit page.
  -- Never a delete: their past stays must keep their host (RESTRICT, 007).
  ADD COLUMN suspended_at timestamptz NULL;

-- Demo accounts have NO password at all: they can only be entered through
-- the demo buttons, so there's nothing to guess or share, and nobody can
-- lock the shared demo host by changing its password. Every other account
-- must have an argon2id hash. (users_password_hash_check is the name
-- PostgreSQL gave 001's inline CHECK.)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT users_password_hash_check;
ALTER TABLE users
  ADD CONSTRAINT users_password_hash_check CHECK (password_hash IS NULL OR password_hash LIKE '$argon2id$%'),
  ADD CONSTRAINT users_password_required CHECK (is_demo OR password_hash IS NOT NULL);

-- The cron's cleanup asks "demo guests created over 24 hours ago". A
-- PARTIAL index holds only demo rows, so it stays tiny however many real
-- people sign up.
CREATE INDEX users_demo_created_idx ON users (created_at) WHERE is_demo;

-- New audit event types. The old ones stay, so existing rows remain valid.
ALTER TABLE auth_events DROP CONSTRAINT auth_events_type_check;
ALTER TABLE auth_events ADD CONSTRAINT auth_events_type_check CHECK (type IN (
  'signed_up', 'email_verified', 'logged_in', 'login_failed', 'logged_out',
  'password_changed', 'password_reset_requested', 'password_reset',
  'session_revoked', 'role_changed', 'profile_updated', 'account_deleted',
  'demo_started', 'became_host'
));
