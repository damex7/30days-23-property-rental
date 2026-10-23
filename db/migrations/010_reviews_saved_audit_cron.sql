-- 010: REVIEWS, the WISHLIST, the ADMIN AUDIT LOG and CRON RUN HISTORY.

-- ---------------------------------------------------------------------------
-- REVIEWS: one per completed booking, written by that booking's guest.
-- ---------------------------------------------------------------------------
CREATE TABLE reviews (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE: one review per stay, enforced by the database. A double submit
  -- gets 23505, turned into "You've already reviewed this stay".
  stay_id     uuid        NOT NULL UNIQUE,
  listing_id  uuid        NOT NULL,
  guest_id    uuid        NOT NULL,
  -- 1-5 each. "Power supply" is its own score because in Nigeria it decides
  -- a stay: guests want to know whether the 24/7 really meant 24/7.
  overall      smallint   NOT NULL CHECK (overall BETWEEN 1 AND 5),
  cleanliness  smallint   NOT NULL CHECK (cleanliness BETWEEN 1 AND 5),
  location     smallint   NOT NULL CHECK (location BETWEEN 1 AND 5),
  value        smallint   NOT NULL CHECK (value BETWEEN 1 AND 5),
  power_supply smallint   NOT NULL CHECK (power_supply BETWEEN 1 AND 5),
  comment     text        NOT NULL CHECK (length(btrim(comment)) BETWEEN 10 AND 2000),
  -- The host's one public reply.
  host_reply  text        NULL CHECK (host_reply IS NULL OR length(btrim(host_reply)) BETWEEN 2 AND 1000),
  host_replied_at timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- COMPOSITE: the review's listing and guest must be THE STAY'S listing
  -- and guest, so a review can't be filed against a different listing, or
  -- by someone who wasn't the guest. RESTRICT: reviews are history.
  CONSTRAINT reviews_stay_fkey FOREIGN KEY (stay_id, listing_id, guest_id)
    REFERENCES stays (id, listing_id, guest_id) ON DELETE RESTRICT,
  CONSTRAINT reviews_reply_time CHECK ((host_reply IS NULL) = (host_replied_at IS NULL))
);
CREATE TRIGGER reviews_set_updated_at BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- The listing page's reviews, newest first, and the average aggregate.
CREATE INDEX reviews_listing_idx ON reviews (listing_id, created_at DESC);
CREATE INDEX reviews_guest_idx ON reviews (guest_id);

-- "Only after the stay is COMPLETED" can't be a CHECK (it reads another
-- table), so it's a trigger: the service checks first and says so nicely;
-- this makes it true for every path, including a script.
CREATE OR REPLACE FUNCTION reviews_require_completed_stay() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM stays s
    WHERE s.id = NEW.stay_id AND s.kind = 'booking' AND s.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'A review needs a completed stay'
      USING ERRCODE = '23514', CONSTRAINT = 'reviews_require_completed_stay';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reviews_require_completed_stay BEFORE INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION reviews_require_completed_stay();

-- ---------------------------------------------------------------------------
-- SAVED LISTINGS (the wishlist)
-- ---------------------------------------------------------------------------
CREATE TABLE saved_listings (
  -- CASCADE on both sides: a wishlist entry means nothing once either the
  -- person or the listing is gone (demo guests are deleted after 24 hours).
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  listing_id uuid        NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One heart per person per listing; also serves "my saved listings".
  PRIMARY KEY (user_id, listing_id)
);
-- The other direction, for the FK check when a listing is deleted.
CREATE INDEX saved_listings_listing_idx ON saved_listings (listing_id);

-- ---------------------------------------------------------------------------
-- AUDIT EVENTS: every admin decision, and who made it.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_events (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- SET NULL: the record of what happened outlives the account that did it.
  actor_id    uuid        NULL REFERENCES users (id) ON DELETE SET NULL,
  action      text        NOT NULL CHECK (action IN (
                'listing_submitted', 'listing_approved', 'listing_rejected',
                'listing_paused', 'listing_unpaused', 'listing_archived',
                'host_suspended', 'host_unsuspended', 'stay_cancelled_by_admin')),
  -- SET NULL for the same reason (only drafts can be deleted anyway).
  listing_id  uuid        NULL REFERENCES listings (id) ON DELETE SET NULL,
  target_user_id uuid     NULL REFERENCES users (id) ON DELETE SET NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_created_idx ON audit_events (created_at DESC);
CREATE INDEX audit_events_listing_idx ON audit_events (listing_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- CRON RUNS: what the daily job did, for /admin.
-- ---------------------------------------------------------------------------
CREATE TABLE cron_runs (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job         text        NOT NULL CHECK (job IN ('daily', 'lazy')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  ok          boolean     NULL,
  -- Counts only ({"holds_expired": 3, ...}), never personal data.
  summary     jsonb       NULL
);
CREATE INDEX cron_runs_started_idx ON cron_runs (started_at DESC);
