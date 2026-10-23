-- 001: accounts.
--
-- One row per person who can sign in. Everything else in the auth system
-- (sessions, email tokens, the audit log) hangs off users.id.

-- citext = "case-insensitive text". Email addresses are case-insensitive in
-- practice: Ada@Example.com and ada@example.com reach the same inbox. With a
-- plain text column, both could sign up as two different accounts, and
-- logging in with the "wrong" capitals would fail. citext compares
-- case-insensitively everywhere: in =, in UNIQUE, and in the index.
CREATE EXTENSION IF NOT EXISTS citext;

-- Keeps updated_at honest: the database sets it on every UPDATE, so no query
-- can forget to.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE users (
  -- Random UUIDs, not 1, 2, 3: ids appear in URLs and admin forms, and a
  -- counting id would reveal how many users there are and invite guessing.
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- UNIQUE creates the index used by every login ("find the user with this
  -- email"), and it is what makes two sign-ups for one address impossible
  -- even if they arrive at the same moment. 254 is the longest valid address.
  email             citext      NOT NULL UNIQUE CHECK (length(email) BETWEEN 3 AND 254),

  name              text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),

  -- The argon2id hash in "PHC string" form:
  --   $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
  -- It carries its own salt and cost settings, so one column is enough and
  -- old hashes keep verifying after the settings are raised. Never the
  -- password itself (see lib/auth/password.ts).
  password_hash     text        NOT NULL CHECK (password_hash LIKE '$argon2id$%'),

  -- A CHECK instead of a separate roles table: there are exactly two roles,
  -- and the database refuses any other value (a typo like 'Admin' included).
  role              text        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),

  -- NULL until the person clicks the link in the verification email. A
  -- timestamp rather than a boolean: it also records WHEN.
  email_verified_at timestamptz NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The admin list is ordered newest first.
CREATE INDEX users_created_at_idx ON users (created_at DESC, id DESC);
