-- 007: LISTINGS, their AMENITIES and their PHOTOS.
--
-- OWNERSHIP IN THE DATABASE ITSELF (the Day 21 pattern). Every row that
-- belongs to a host's listing (a photo, a price rule, a calendar block)
-- carries host_id AS WELL AS listing_id, and points at the listing with a
-- COMPOSITE foreign key:
--
--     FOREIGN KEY (host_id, listing_id) REFERENCES listings (host_id, id)
--
-- A plain "listing_id REFERENCES listings (id)" only proves the listing
-- EXISTS. The composite key proves it exists AND belongs to the host named
-- on the row. The services always write host_id = the signed-in host, so
-- even if one forgot its ownership check and tried to add Tunde's photo to
-- Amaka's flat, the database would find no (Tunde, Amaka's-listing) pair
-- and refuse the INSERT (23503). A whole class of bugs can't be written.

-- EXTENSIONS
-- pg_trgm: TRIGRAM matching. "Lekki" is split into the three-letter pieces
--   "  l", " le", "lek", "ekk", "kki", "ki " and two strings are as similar
--   as the share of pieces they have in common. So "Leki", "lekki ph1" and
--   "Lekki Phase 1" score as close, which full-text search (whole words
--   only) can't do. It also provides GIN index support for the % operator,
--   so the fuzzy match doesn't read every row.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- btree_gist: lets a GiST index (the kind that understands ranges and
--   "overlaps") ALSO compare plain values like a uuid with =. The
--   no-double-booking constraint in 008 needs exactly that pair: SAME
--   listing (=) AND OVERLAPPING nights (&&). Without this extension
--   PostgreSQL has no GiST operator class for "uuid =".
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- AMENITIES: a small reference table, not a text[] on listings.
--
-- Why a table?
--   1. ONE SPELLING. A text array would let "wifi", "Wi-Fi" and "WiFi"
--      all exist, and a filter for one misses the others. Here the foreign
--      key only accepts codes that exist.
--   2. LABELS AND GROUPS live in one place (the filter sheet, the listing
--      page and the host form all read them), and adding "Starlink" is an
--      INSERT, not a code change.
--   3. "HAS ALL OF Wi-Fi, generator and parking" is a plain indexed query:
--        SELECT listing_id FROM listing_amenities
--        WHERE amenity_code = ANY ('{wifi,generator,parking}')
--        GROUP BY listing_id HAVING count(*) = 3
--      (count = how many were asked for, so ALL must be present; the
--      primary key below guarantees no duplicate pairs inflate the count).
-- ---------------------------------------------------------------------------
CREATE TABLE amenities (
  -- A short stable code used in URLs (?amenities=wifi,power-24-7).
  code       text     PRIMARY KEY CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(code) <= 30),
  label      text     NOT NULL CHECK (length(btrim(label)) BETWEEN 2 AND 40),
  -- Groups the filter sheet and listing page into sections.
  grp        text     NOT NULL CHECK (grp IN ('power', 'essentials', 'safety', 'comfort', 'entertainment')),
  sort_order smallint NOT NULL DEFAULT 0
);

-- Reference data belongs with the schema: every database needs these rows.
INSERT INTO amenities (code, label, grp, sort_order) VALUES
  ('power-24-7', '24/7 power',              'power',         1),
  ('generator',  'Generator backup',        'power',         2),
  ('inverter',   'Inverter backup',         'power',         3),
  ('solar',      'Solar power',             'power',         4),
  ('wifi',       'Wi-Fi',                   'essentials',   10),
  ('borehole',   'Borehole water',          'essentials',   11),
  ('ac',         'Air conditioning',        'essentials',   12),
  ('kitchen',    'Kitchen',                 'essentials',   13),
  ('washer',     'Washing machine',         'essentials',   14),
  ('workspace',  'Desk for work',           'essentials',   15),
  ('security',   '24/7 security',           'safety',       20),
  ('cctv',       'CCTV at the gate',        'safety',       21),
  ('gated',      'Gated estate',            'safety',       22),
  ('parking',    'Parking',                 'comfort',      30),
  ('pool',       'Pool',                    'comfort',      31),
  ('gym',        'Gym',                     'comfort',      32),
  ('housekeeping','Housekeeping',           'comfort',      33),
  ('ps5',        'PS5',                     'entertainment',40),
  ('netflix',    'Netflix',                 'entertainment',41),
  ('dstv',       'DStv',                    'entertainment',42);

-- ---------------------------------------------------------------------------
-- LISTINGS
-- ---------------------------------------------------------------------------
CREATE TABLE listings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- RESTRICT: a host with listings can't be deleted. Their past guests'
  -- stays must keep a host; an admin SUSPENDS a host instead (006).
  host_id     uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

  -- The public URL: /stays/<slug>. Lower-case words joined by hyphens,
  -- unique across the site (the UNIQUE index serves the page lookup).
  slug        text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 90),

  title       text        NOT NULL CHECK (length(btrim(title)) BETWEEN 5 AND 90),
  description text        NOT NULL DEFAULT '' CHECK (length(description) <= 5000),

  -- 'bq' = boys' quarters: the self-contained flat behind a Nigerian house.
  property_type text      NOT NULL CHECK (property_type IN ('studio', 'apartment', 'duplex', 'room', 'bq')),
  -- smallint: these are small counts. A studio has 0 bedrooms.
  bedrooms    smallint    NOT NULL CHECK (bedrooms BETWEEN 0 AND 20),
  bathrooms   smallint    NOT NULL CHECK (bathrooms BETWEEN 1 AND 20),
  max_guests  smallint    NOT NULL CHECK (max_guests BETWEEN 1 AND 30),

  -- LOCATION. NULL while the draft hasn't reached the location step; the
  -- listings_complete CHECK below demands them before review.
  state       text        NULL CHECK (state IS NULL OR length(btrim(state)) BETWEEN 2 AND 40),
  city        text        NULL CHECK (city IS NULL OR length(btrim(city)) BETWEEN 2 AND 60),
  -- The neighbourhood shown publicly ("Lekki Phase 1", "Wuse 2").
  area        text        NULL CHECK (area IS NULL OR length(btrim(area)) BETWEEN 2 AND 60),
  -- PRIVATE. The exact street address. Only ever selected by the query for
  -- a guest's CONFIRMED booking (lib/repos/stays.ts); the public listing
  -- query never names this column. See "Location privacy" in the README.
  address_line text       NULL CHECK (address_line IS NULL OR length(btrim(address_line)) BETWEEN 5 AND 200),
  -- EXACT coordinates, also PRIVATE. numeric(9,6) is about 10 cm of
  -- precision, stored exactly (no float drift). The public pages get a
  -- ROUNDED, offset version computed on the server (lib/privacy.ts).
  -- The bounds are Nigeria's, so a swapped lat/lng is refused.
  lat         numeric(9,6) NULL CHECK (lat IS NULL OR lat BETWEEN 4.0 AND 14.0),
  lng         numeric(9,6) NULL CHECK (lng IS NULL OR lng BETWEEN 2.5 AND 15.0),

  -- MONEY: whole kobo in bigint, never a float (Day 21). NULL until the
  -- pricing step. ₦5,000 to ₦10,000,000 a night.
  nightly_kobo         bigint NULL CHECK (nightly_kobo IS NULL OR nightly_kobo BETWEEN 500000 AND 1000000000),
  -- Friday and Saturday NIGHTS (check in Friday, the Friday night costs
  -- this). NULL = same as weekdays.
  weekend_kobo         bigint NULL CHECK (weekend_kobo IS NULL OR weekend_kobo BETWEEN 500000 AND 1000000000),
  -- Charged once per stay.
  cleaning_fee_kobo    bigint NOT NULL DEFAULT 0 CHECK (cleaning_fee_kobo BETWEEN 0 AND 100000000),
  -- REFUNDABLE caution fee, held against damage. Very common for Nigerian
  -- short-lets; always refundable on cancellation (lib/services/bookings.ts).
  caution_deposit_kobo bigint NOT NULL DEFAULT 0 CHECK (caution_deposit_kobo BETWEEN 0 AND 500000000),
  -- Off the nightly subtotal for stays of 7+ nights.
  weekly_discount_percent smallint NOT NULL DEFAULT 0 CHECK (weekly_discount_percent BETWEEN 0 AND 50),

  min_nights  smallint    NOT NULL DEFAULT 1 CHECK (min_nights BETWEEN 1 AND 30),
  max_nights  smallint    NOT NULL DEFAULT 30 CHECK (max_nights BETWEEN 1 AND 90),
  -- Wall-clock times in Lagos ('time' has no zone, deliberately: "2 PM at
  -- the flat", whatever the server's zone).
  check_in_time  time     NOT NULL DEFAULT '14:00',
  check_out_time time     NOT NULL DEFAULT '11:00',
  cancellation_policy text NOT NULL DEFAULT 'moderate' CHECK (cancellation_policy IN ('flexible', 'moderate', 'strict')),
  house_rules text        NOT NULL DEFAULT '' CHECK (length(house_rules) <= 2000),
  -- PRIVATE, like address_line: gate codes, the caretaker's name.
  checkin_instructions text NOT NULL DEFAULT '' CHECK (length(checkin_instructions) <= 2000),

  -- THE LIFECYCLE:
  --   draft -> pending_review -> published <-> paused
  --                     \-> rejected -> (edited) -> pending_review
  --   archived: retired for good; kept because its stays point at it.
  -- Listings with bookings are never deleted (stays.listing_id RESTRICT).
  status      text        NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'pending_review', 'published', 'paused', 'rejected', 'archived')),
  -- Why the admin said no. Emailed to the host and shown on their listing.
  rejection_reason text   NULL CHECK (rejection_reason IS NULL OR length(btrim(rejection_reason)) BETWEEN 10 AND 1000),
  submitted_at timestamptz NULL,
  published_at timestamptz NULL,

  -- CACHED REVIEW AVERAGE. The truth is the reviews table (aggregate in
  -- lib/repos/reviews.ts); this copy exists so "top rated" can be a keyset
  -- sort over an index instead of an aggregate over every review on every
  -- search. It's refreshed in the SAME transaction as each review insert
  -- (so it can't drift) and recomputed by the daily cron (so even a manual
  -- SQL fix heals within a day). README: "Should review averages be cached?"
  rating_avg   numeric(3,2) NULL CHECK (rating_avg IS NULL OR rating_avg BETWEEN 1 AND 5),
  rating_count integer     NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  -- "Recommended": a Bayesian average, rating_avg pulled towards 4.0 by 3
  -- imaginary reviews, so one 5-star review doesn't outrank forty 4.8s.
  -- Stored (not computed per search) for the same reason as above.
  recommended_score numeric(4,3) NOT NULL DEFAULT 4.000,

  -- FULL-TEXT SEARCH, kept up to date by PostgreSQL itself: a GENERATED
  -- column is recomputed on every INSERT/UPDATE, so no code path can forget.
  -- Weights rank matches: A (title, area) beats B (city) beats C (the
  -- description). 'simple' (no stemming) for place names, so "Ikoyi" isn't
  -- mangled by English rules; 'english' for prose, so "apartments" matches
  -- "apartment".
  search tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(area, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(city, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED,

  -- Rotating this invalidates old iCal links (the token includes it).
  ical_version integer NOT NULL DEFAULT 1,
  -- OPTIMISTIC CONCURRENCY for the multi-step form: every save says "I
  -- edited version 4"; if it's now 5 (another tab), the save is refused.
  version     integer     NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT listings_nights_order CHECK (max_nights >= min_nights),
  -- A draft may be half-filled; anything beyond draft must be complete.
  -- (Photos are in another table, so "at least one photo" is checked by the
  -- service when the host submits.)
  CONSTRAINT listings_complete CHECK (
    status = 'draft' OR (
      state IS NOT NULL AND city IS NOT NULL AND area IS NOT NULL AND address_line IS NOT NULL
      AND lat IS NOT NULL AND lng IS NOT NULL AND nightly_kobo IS NOT NULL
    )
  ),
  -- A rejection always says why (explicit IS NOT NULL: a CHECK passes on
  -- NULL, the Day 18 lesson).
  CONSTRAINT listings_rejection_reason CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL),
  CONSTRAINT listings_published_at CHECK (status <> 'published' OR published_at IS NOT NULL),
  -- The TARGET of every composite foreign key (see the top of this file):
  -- a foreign key may only point at columns that are unique together.
  CONSTRAINT listings_host_id_id_key UNIQUE (host_id, id)
);

CREATE TRIGGER listings_set_updated_at BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- INDEXES. Each one serves a named query (EXPLAIN output in the README).
-- The text search: GIN maps each word to the rows containing it.
CREATE INDEX listings_search_idx ON listings USING gin (search);
-- The fuzzy area/city match (% and similarity()). gin_trgm_ops indexes
-- every trigram, so "Leki" finds "Lekki" without reading every row.
CREATE INDEX listings_area_trgm_idx ON listings USING gin (area gin_trgm_ops);
CREATE INDEX listings_city_trgm_idx ON listings USING gin (city gin_trgm_ops);
-- The keyset sorts. PARTIAL (WHERE status = 'published'): search only ever
-- asks for published listings, so drafts and paused ones aren't in the
-- index at all and it stays small. The id is the tie-breaker of every sort.
CREATE INDEX listings_pub_price_idx ON listings (nightly_kobo, id) WHERE status = 'published';
CREATE INDEX listings_pub_newest_idx ON listings (published_at DESC, id DESC) WHERE status = 'published';
CREATE INDEX listings_pub_rating_idx ON listings ((coalesce(rating_avg, 0)) DESC, id DESC) WHERE status = 'published';
CREATE INDEX listings_pub_recommended_idx ON listings (recommended_score DESC, id DESC) WHERE status = 'published';
-- The map box: lat BETWEEN and lng BETWEEN. A btree on (lat, lng) narrows
-- by latitude and checks longitude inside that slice: plenty for a few
-- thousand listings (PostGIS would be the next step, see the README).
CREATE INDEX listings_pub_geo_idx ON listings (lat, lng) WHERE status = 'published';
-- "My listings" for a host, and the FK check when a host row is deleted.
CREATE INDEX listings_host_idx ON listings (host_id, updated_at DESC);
-- The admin's review queue, oldest first.
CREATE INDEX listings_pending_idx ON listings (submitted_at) WHERE status = 'pending_review';

-- ---------------------------------------------------------------------------
-- LISTING AMENITIES (many-to-many)
-- ---------------------------------------------------------------------------
CREATE TABLE listing_amenities (
  -- CASCADE: an amenity link means nothing without its listing (and only
  -- drafts can be deleted at all).
  listing_id   uuid NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  -- RESTRICT: deleting the "wifi" amenity while listings use it is refused;
  -- retire it deliberately instead.
  amenity_code text NOT NULL REFERENCES amenities (code) ON DELETE RESTRICT,
  -- The primary key stops a listing having "wifi" twice (which would break
  -- the HAVING count(*) = n filter) and serves "amenities of a listing".
  PRIMARY KEY (listing_id, amenity_code)
);
-- The other direction: "listings that have wifi", used by the ALL filter.
CREATE INDEX listing_amenities_code_idx ON listing_amenities (amenity_code, listing_id);

-- ---------------------------------------------------------------------------
-- LISTING PHOTOS
--
-- The IMAGE ITSELF is never in the database: it lives in Vercel Blob (a CDN
-- in front of object storage) and this row holds its URL. A 3 MB photo in
-- a bytea column would make every backup, every replica and every
-- SELECT * that touches it 3 MB heavier, and the database would have to
-- serve image bytes that a CDN serves faster and cheaper, from close to
-- the visitor. README: "Why images never go in the database".
-- ---------------------------------------------------------------------------
CREATE TABLE listing_photos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    uuid        NOT NULL,
  -- Part of the composite foreign key below: the photo's host must be the
  -- listing's host.
  host_id       uuid        NOT NULL,
  -- Only our Blob store (uploads) or the seed's local files are accepted, so
  -- a crafted request can't make the site show an image from anywhere.
  blob_url      text        NOT NULL CHECK (blob_url ~ '^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/listings/' OR blob_url ~ '^/seed/[a-z0-9-]+\.svg$'),
  -- The Blob pathname: what del() needs to delete the file.
  blob_pathname text        NOT NULL CHECK (length(blob_pathname) <= 300),
  -- Pixel size, so next/image reserves the right space (no layout jump).
  width         integer     NOT NULL CHECK (width BETWEEN 1 AND 20000),
  height        integer     NOT NULL CHECK (height BETWEEN 1 AND 20000),
  -- REQUIRED, and must say something: a screen reader user hears this
  -- instead of seeing the photo ("Bedroom with a king bed and a wall AC").
  alt_text      text        NOT NULL CHECK (length(btrim(alt_text)) BETWEEN 5 AND 200),
  -- 0 is the COVER. 0..11 and unique per listing = at most 12 photos,
  -- enforced by the database whatever the upload route forgets.
  position      smallint    NOT NULL CHECK (position BETWEEN 0 AND 11),
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- CASCADE: photos go with their listing (only drafts can be deleted; the
  -- service deletes the blobs first).
  CONSTRAINT listing_photos_listing_fkey FOREIGN KEY (host_id, listing_id)
    REFERENCES listings (host_id, id) ON DELETE CASCADE,
  -- DEFERRABLE: a reorder is ONE UPDATE that renumbers every photo, and
  -- halfway through it two rows briefly share a position (photo A moved to
  -- 0 while photo B is still at 0). A plain UNIQUE checks row by row and
  -- would refuse that; DEFERRABLE checks once at the end of the statement,
  -- when the numbering is whole again. (INITIALLY IMMEDIATE: still checked
  -- per statement, not postponed to COMMIT.)
  CONSTRAINT listing_photos_position_key UNIQUE (listing_id, position) DEFERRABLE INITIALLY IMMEDIATE
);
