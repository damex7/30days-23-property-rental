-- 012: the seed's photos are now real room photographs (CC0, see
-- public/seed/CREDITS.md) in JPEG and WebP instead of drawn SVGs, so the
-- CHECK on listing_photos.blob_url accepts those extensions under /seed/.
-- Uploaded photos are unchanged: they must still come from our Blob store,
-- so a crafted request can't make the site show an image from anywhere.
ALTER TABLE listing_photos DROP CONSTRAINT listing_photos_blob_url_check;
ALTER TABLE listing_photos ADD CONSTRAINT listing_photos_blob_url_check CHECK (
  blob_url ~ '^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/listings/'
  OR blob_url ~ '^/seed/[a-z0-9-]+\.(svg|jpg|webp)$'
);
