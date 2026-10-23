-- 011: APPROXIMATE COORDINATES, computed INSIDE the database.
--
-- THE RULE: before a booking is confirmed, nobody sees where a flat really
-- is: only its area, and a circle on the map about a kilometre wide. The
-- exact pin (and the street address) goes only to the guest of a confirmed
-- booking.
--
-- Why in SQL and not by hiding things in the UI? Anything sent to the
-- browser can be read: "hidden" props are in the page's HTML and in the
-- React payload, a map library keeps the exact marker position in memory,
-- and the developer tools show every network response. So the exact values
-- must never LEAVE THE SERVER for a public page. These functions let the
-- public queries select approx_lat(...) and approx_lng(...) instead of lat
-- and lng, so the exact numbers aren't even in the query result that the
-- server code holds while rendering a public page.
--
-- HOW: round to 2 decimal places (0.01 degree is about 1.1 km in Nigeria),
-- then add a small fixed offset (up to ±0.004 degree, ~450 m) derived from
-- the listing's id, so a dozen flats in one estate don't all sit on the
-- same grid point. The offset is decoration, not secrecy: the PRECISION is
-- limited by the rounding, which can't be undone. IMMUTABLE (same input,
-- same output), so a listing's circle doesn't wander between page loads.
CREATE OR REPLACE FUNCTION approx_coord(value numeric, listing_id uuid, salt integer)
RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT round(value, 2)
       + ((('x' || substr(md5(listing_id::text || salt::text), 1, 4))::bit(16)::integer / 65535.0) - 0.5) * 0.008
$$;

CREATE OR REPLACE FUNCTION approx_lat(lat numeric, listing_id uuid) RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT round(approx_coord(lat, listing_id, 1), 5) $$;

CREATE OR REPLACE FUNCTION approx_lng(lng numeric, listing_id uuid) RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT round(approx_coord(lng, listing_id, 2), 5) $$;

-- THE MAP BOX FILTERS ON THE APPROXIMATE COORDINATES TOO. If "search as I
-- move the map" compared the EXACT lat/lng, anyone could find a flat's real
-- position by shrinking the box until the listing drops out, then nudging
-- each edge: twenty searches would pin it to a few metres. Filtering on the
-- same rounded values the map shows leaks nothing the map doesn't already.
-- An EXPRESSION index (allowed because the functions are IMMUTABLE) keeps
-- that filter indexed; it replaces 007's index on the exact columns.
DROP INDEX IF EXISTS listings_pub_geo_idx;
CREATE INDEX listings_pub_approx_geo_idx ON listings (approx_lat(lat, id), approx_lng(lng, id)) WHERE status = 'published';
