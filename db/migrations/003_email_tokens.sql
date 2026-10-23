-- 003: one-time tokens sent by email: "verify your email" and "reset your
-- password" links.
--
-- Same idea as sessions: the link contains a random token, and only its
-- SHA-256 hash is stored. Someone who can read this table still can't build
-- a working reset link.
CREATE TABLE email_tokens (
  token_hash text        PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),

  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- One table for both kinds, but a token made for one purpose can never be
  -- used for the other: every lookup says which purpose it expects.
  purpose    text        NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),

  created_at timestamptz NOT NULL DEFAULT now(),

  -- SHORT EXPIRY: a reset link sitting in an old inbox is a standing key to
  -- the account. Reset links last 30 minutes, verification links 24 hours.
  expires_at timestamptz NOT NULL,

  -- SINGLE USE: set when the link is used. Consuming a token is one atomic
  -- UPDATE ... WHERE used_at IS NULL, so two clicks at the same moment can't
  -- both succeed. Kept (not deleted) so "this link was already used" can be
  -- told apart from "this link never existed".
  used_at    timestamptz NULL,

  CHECK (expires_at > created_at)
);

-- Sending a new link cancels the older unused ones for the same user and
-- purpose: UPDATE ... WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL.
CREATE INDEX email_tokens_user_purpose_idx ON email_tokens (user_id, purpose);

-- The cleanup sweep.
CREATE INDEX email_tokens_expires_at_idx ON email_tokens (expires_at);
