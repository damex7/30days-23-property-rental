-- 008: STAYS, the heart of the day. Everything that occupies a listing's
-- nights lives in this ONE table: a guest's booking, and a host's "not
-- available" block.
--
-- WHY ONE TABLE FOR BOOKINGS AND BLOCKS? Because the rule we care about,
-- "no two things may occupy the same night of the same listing", is
-- enforced by an EXCLUSION CONSTRAINT, and an exclusion constraint (like a
-- UNIQUE constraint) only ever looks at rows of ITS OWN table. With blocks
-- in a separate table, a booking could be inserted over a block and nothing
-- in the database would notice; we'd be back to "check first, then
-- insert", which two simultaneous requests can both pass.
--
-- NIGHTS ARE A daterange '[)': the check-in date INCLUDED, the check-out
-- date EXCLUDED. A stay from the 10th to the 12th is the NIGHTS of the
-- 10th and 11th: '[2026-12-10, 2026-12-12)'. So:
--   Ada:   [10, 12)   nights 10, 11; she checks out on the morning of the 12th
--   Bayo:  [12, 15)   nights 12, 13, 14; he checks in that afternoon
-- [10,12) && [12,15) is FALSE (they share no night), so back-to-back stays
-- are allowed, and the same night can never be sold twice.
CREATE TABLE stays (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'booking' (a guest's stay) or 'host_block' (the host closed these nights).
  kind        text        NOT NULL CHECK (kind IN ('booking', 'host_block')),

  listing_id  uuid        NOT NULL,
  -- The listing's host, copied here for the composite foreign key below: a
  -- block can only be written for a listing OF THE SAME HOST. The services
  -- write host_id from the listing (bookings) or from the signed-in host
  -- (blocks); if they disagree with the listing, the INSERT fails (23503).
  host_id     uuid        NOT NULL,

  -- NULL for host blocks. RESTRICT: a guest with stays can't be deleted
  -- (their host and their money records need them). Demo guests are removed
  -- by the cleanup, which deletes their stays first.
  guest_id    uuid        NULL REFERENCES users (id) ON DELETE RESTRICT,

  nights      daterange   NOT NULL,
  -- How many nights: derived from the range by PostgreSQL itself, so it can
  -- never disagree with it. Used by the earnings and occupancy queries.
  nights_count integer    GENERATED ALWAYS AS (upper(nights) - lower(nights)) STORED,

  -- held      : a 15-minute hold while the guest pays. BLOCKS the nights.
  -- confirmed : paid (or an active host block). BLOCKS the nights.
  -- cancelled : by the guest, the host or an admin. Frees the nights.
  -- expired   : the hold ran out unpaid. Frees the nights.
  -- completed : the stay happened (set the day after check-out).
  status      text        NOT NULL
              CHECK (status IN ('held', 'confirmed', 'cancelled', 'expired', 'completed')),
  -- When a 'held' stay stops holding. Only meaningful while held.
  hold_expires_at timestamptz NULL,

  guests_count smallint   NULL CHECK (guests_count IS NULL OR guests_count BETWEEN 1 AND 30),

  -- THE PRICE SNAPSHOT. Worked out ON THE SERVER at reserve time by
  -- lib/pricing.ts and frozen here. The browser never sends a price, and a
  -- host changing their price tomorrow doesn't change what this guest
  -- agreed to pay. price_lines is the night-by-night breakdown shown on the
  -- trip page and in the emails; the columns are the totals (kobo).
  price_lines          jsonb  NULL,
  subtotal_kobo        bigint NULL CHECK (subtotal_kobo IS NULL OR subtotal_kobo >= 0),
  discount_kobo        bigint NULL CHECK (discount_kobo IS NULL OR discount_kobo >= 0),
  cleaning_fee_kobo    bigint NULL CHECK (cleaning_fee_kobo IS NULL OR cleaning_fee_kobo >= 0),
  service_fee_kobo     bigint NULL CHECK (service_fee_kobo IS NULL OR service_fee_kobo >= 0),
  caution_deposit_kobo bigint NULL CHECK (caution_deposit_kobo IS NULL OR caution_deposit_kobo >= 0),
  total_kobo           bigint NULL CHECK (total_kobo IS NULL OR total_kobo > 0),
  -- The policy AT BOOKING TIME: a host switching to 'strict' later can't
  -- shrink an existing guest's refund.
  cancellation_policy  text   NULL CHECK (cancellation_policy IS NULL OR cancellation_policy IN ('flexible', 'moderate', 'strict')),

  -- Ties the stay to its Paystack transaction (we generate it).
  paystack_reference text  NULL UNIQUE CHECK (paystack_reference IS NULL OR paystack_reference ~ '^SB-[A-Z0-9-]{6,40}$'),
  -- The browser's Idempotency-Key for "Reserve": a double tap sends the same
  -- key twice, and the partial unique index below makes the second insert
  -- impossible, so the guest gets their first hold back.
  idempotency_key text    NULL CHECK (idempotency_key IS NULL OR idempotency_key ~ '^[A-Za-z0-9_-]{8,100}$'),

  -- A host's private note on a block ("Family visiting").
  block_note  text        NULL CHECK (block_note IS NULL OR length(block_note) <= 200),

  confirmed_at  timestamptz NULL,
  cancelled_at  timestamptz NULL,
  cancelled_by  text        NULL CHECK (cancelled_by IS NULL OR cancelled_by IN ('guest', 'host', 'admin', 'system')),
  completed_at  timestamptz NULL,
  -- Set when the "how was your stay?" email is claimed, so it's sent once.
  review_reminder_sent_at timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- RESTRICT: a listing with stays is never deleted, only paused/archived.
  CONSTRAINT stays_listing_fkey FOREIGN KEY (host_id, listing_id)
    REFERENCES listings (host_id, id) ON DELETE RESTRICT,

  -- A FINITE, NON-EMPTY, HALF-OPEN range. daterange('2026-12-10',
  -- '2026-12-12') is '[)' by default, but a range typed by hand could be
  -- '[]' or open-ended; this refuses every other shape.
  CONSTRAINT stays_nights_shape CHECK (
    NOT isempty(nights) AND NOT lower_inf(nights) AND NOT upper_inf(nights)
    AND lower_inc(nights) AND NOT upper_inc(nights)
  ),
  CONSTRAINT stays_max_length CHECK (upper(nights) - lower(nights) <= 90),

  -- What each kind must and mustn't have.
  CONSTRAINT stays_kind_shape CHECK (
    (kind = 'host_block' AND guest_id IS NULL AND total_kobo IS NULL AND status IN ('confirmed', 'cancelled'))
    OR
    (kind = 'booking' AND guest_id IS NOT NULL AND guests_count IS NOT NULL
      AND price_lines IS NOT NULL AND subtotal_kobo IS NOT NULL AND discount_kobo IS NOT NULL
      AND cleaning_fee_kobo IS NOT NULL AND service_fee_kobo IS NOT NULL
      AND caution_deposit_kobo IS NOT NULL AND total_kobo IS NOT NULL AND cancellation_policy IS NOT NULL)
  ),
  -- The total is the sum of its parts, to the kobo, or the row is refused.
  CONSTRAINT stays_total_adds_up CHECK (
    total_kobo IS NULL OR total_kobo = subtotal_kobo - discount_kobo + cleaning_fee_kobo + service_fee_kobo + caution_deposit_kobo
  ),
  CONSTRAINT stays_hold_has_expiry CHECK (status <> 'held' OR hold_expires_at IS NOT NULL),
  -- A host can't book their own listing (the service says so nicely first).
  CONSTRAINT stays_not_own_listing CHECK (guest_id IS NULL OR guest_id <> host_id),

  -- ===================== NO DOUBLE BOOKING =====================
  -- No two rows for the SAME listing (=) whose nights OVERLAP (&&) may both
  -- be 'held' or 'confirmed'.
  --
  -- Why this and not "SELECT for a clash, then INSERT" in the app? Two
  -- guests press Reserve for 20-24 December at the same moment. Both
  -- SELECTs run before either INSERT, both see the nights free, both
  -- insert: double booked. Any check-then-write in application code has
  -- that gap. The constraint is enforced INSIDE the database as each row is
  -- written, through the GiST index it creates; PostgreSQL makes the second
  -- writer wait for the first to commit and then fail with 23P01
  -- (exclusion_violation). It also protects every path that isn't the
  -- Reserve button: a host block, an admin fix, a script, a future bug.
  --
  -- WHERE: cancelled and expired stays free their nights; completed ones
  -- are in the past. Note what it CAN'T say: "held AND not yet expired".
  -- A constraint's condition must be immutable, and now() changes, so a
  -- hold past its 15 minutes still blocks until it's marked 'expired'
  -- (lib/services/bookings.ts does that first, in the same transaction).
  CONSTRAINT stays_no_overlap EXCLUDE USING gist (listing_id WITH =, nights WITH &&)
    WHERE (status IN ('held', 'confirmed')),

  -- Target for reviews' composite foreign key (010): a review must name the
  -- stay's own listing and guest.
  CONSTRAINT stays_id_listing_guest_key UNIQUE (id, listing_id, guest_id)
);

CREATE TRIGGER stays_set_updated_at BEFORE UPDATE ON stays
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A double-tapped Reserve can't create a second hold: one row per guest per
-- key (partial: blocks and old rows have no key).
CREATE UNIQUE INDEX stays_idempotency_idx ON stays (guest_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
-- "My trips", upcoming first.
CREATE INDEX stays_guest_idx ON stays (guest_id, lower(nights)) WHERE guest_id IS NOT NULL;
-- The expiry sweep: only held rows are in this index, so it's tiny.
CREATE INDEX stays_held_expiry_idx ON stays (hold_expires_at) WHERE status = 'held';
-- The "mark completed" sweep: confirmed bookings by check-out date.
CREATE INDEX stays_confirmed_checkout_idx ON stays ((upper(nights))) WHERE status = 'confirmed' AND kind = 'booking';
-- The host's bookings list and dashboard.
CREATE INDEX stays_host_idx ON stays (host_id, lower(nights));
-- (The availability check, "does any held/confirmed stay of this listing
-- overlap these nights?", is served by the GiST index the exclusion
-- constraint already created. No extra index needed.)

-- ---------------------------------------------------------------------------
-- PRICE RULES: a host's special nightly price for a date range ("Detty
-- December", a public holiday weekend). They override the weekday/weekend
-- price for those nights only (lib/pricing.ts). Same ownership pattern,
-- and their own exclusion constraint: two rules can't cover the same night,
-- so "which price applies?" always has exactly one answer.
-- ---------------------------------------------------------------------------
CREATE TABLE price_rules (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   uuid        NOT NULL,
  host_id      uuid        NOT NULL,
  nights       daterange   NOT NULL,
  nightly_kobo bigint      NOT NULL CHECK (nightly_kobo BETWEEN 500000 AND 1000000000),
  label        text        NOT NULL CHECK (length(btrim(label)) BETWEEN 2 AND 40),
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- CASCADE: a price rule is meaningless without its listing.
  CONSTRAINT price_rules_listing_fkey FOREIGN KEY (host_id, listing_id)
    REFERENCES listings (host_id, id) ON DELETE CASCADE,
  CONSTRAINT price_rules_nights_shape CHECK (
    NOT isempty(nights) AND NOT lower_inf(nights) AND NOT upper_inf(nights)
    AND lower_inc(nights) AND NOT upper_inc(nights)
  ),
  CONSTRAINT price_rules_no_overlap EXCLUDE USING gist (listing_id WITH =, nights WITH &&)
);
