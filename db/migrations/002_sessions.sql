-- 002: sessions. One row per signed-in browser.
--
-- The browser's cookie holds a long random TOKEN. This table holds only the
-- SHA-256 HASH of that token. Each request hashes the cookie and looks the
-- hash up here.
--
-- WHY A HASH AND NOT THE TOKEN: if this table ever leaks (a backup, a log, a
-- read-only SQL injection, a curious employee), the attacker has hashes, and
-- a hash can't be turned back into the cookie value. Without the cookie they
-- can't act as anyone. If we stored the raw token, a leaked row would BE a
-- working login.
--
-- Why a fast hash (SHA-256) here when passwords need a slow one (argon2)?
-- Passwords are chosen by people and can be guessed: "slow" makes each guess
-- expensive. A token is 256 random bits from the computer: there is nothing
-- to guess, so slowness would only cost us time on every request.
CREATE TABLE sessions (
  -- The hash, as 64 lowercase hex characters. The CHECK refuses anything
  -- else, so a raw token can't be stored here by mistake. As the PRIMARY KEY
  -- it gets a unique index: the lookup on every request is one index probe
  -- (see the EXPLAIN output in the README).
  id           text        PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),

  -- CASCADE: deleting a user deletes their sessions too, so a deleted
  -- account can't stay signed in anywhere.
  user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  created_at   timestamptz NOT NULL DEFAULT now(),

  -- Checked on every request; pushed forward by sliding renewal
  -- (lib/auth/session.ts). Stored server-side because the cookie's own
  -- expiry is only a hint the browser follows: the database decides.
  expires_at   timestamptz NOT NULL,

  -- "Last active" on /account/sessions. Updated at most every few minutes,
  -- so reading a page doesn't always mean writing a row.
  last_seen_at timestamptz NOT NULL DEFAULT now(),

  -- Shown to the user so they can recognise each session ("Chrome on
  -- Windows, Lagos, NG") and revoke one they don't recognise.
  user_agent   text        NULL CHECK (length(user_agent) <= 512),
  ip           text        NULL CHECK (length(ip) <= 64),
  location     text        NULL CHECK (length(location) <= 120),

  CHECK (expires_at > created_at)
);

-- "List my sessions", "sign out everywhere else" and "revoke all of this
-- user's sessions" all start from user_id. Without this index each would
-- read the whole table.
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- The cleanup sweep: DELETE ... WHERE expires_at < now().
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
