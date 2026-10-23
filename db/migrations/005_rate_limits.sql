-- 005: rate-limit counters, e.g. "login attempts from this IP in the
-- current 15-minute window".
--
-- WHY IN POSTGRES AND NOT IN MEMORY: on Vercel, each request may run in a
-- different short-lived function instance. A counter in one instance's
-- memory is invisible to the others and disappears when the instance
-- sleeps, so an attacker spreading guesses across instances would never hit
-- the limit. The database is the one place every instance shares.
--
-- Each check is ONE atomic statement, INSERT ... ON CONFLICT DO UPDATE ...
-- RETURNING (lib/auth/rate-limit.ts): two requests at the same moment can't
-- both read "4 attempts" and both decide they are the 5th.
CREATE TABLE rate_limits (
  -- What is being counted, and for whom: "login:ip:203.0.113.7",
  -- "login:email:ada@example.com". The PRIMARY KEY is the conflict target
  -- of the upsert.
  key          text        PRIMARY KEY CHECK (length(key) <= 300),

  -- When the current window began. Once window_start + window length has
  -- passed, the next attempt starts a fresh window at count 1.
  window_start timestamptz NOT NULL DEFAULT now(),

  count        integer     NOT NULL DEFAULT 1 CHECK (count >= 0)
);

-- The cleanup sweep deletes windows that ended long ago.
CREATE INDEX rate_limits_window_start_idx ON rate_limits (window_start);
