import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Cache Components (the Next.js 16.4 default): nothing is cached unless a
  // function says 'use cache'. Pages read the session cookie and the URL
  // inside <Suspense>, so each page's frame is sent straight away and the
  // personal parts stream in.
  cacheComponents: true,
  partialPrefetching: true,

  images: {
    // next/image only optimises images from hosts listed here, so nobody can
    // use our image optimiser as a free proxy for any URL on the internet.
    // Our photos live in Vercel Blob: <store-id>.public.blob.vercel-storage.com.
    remotePatterns: [{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com', pathname: '/listings/**', search: '' }],
    // Local images: only the seed's room photos (JPEG and WebP, CC0, see
    // public/seed/CREDITS.md), without query strings. next/image resizes
    // them for each card and serves AVIF/WebP to browsers that accept it.
    localPatterns: [{ pathname: '/seed/**', search: '' }],
  },

  // SECURITY HEADERS, sent with every response.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // CLICKJACKING: no other site may show our pages in a frame, where
          // a "Reserve" button could be hidden under a decoy.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // The map asks for nothing; the camera, mic and location stay off.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // Pages whose URL contains a secret token: send NO Referer at all.
        source: '/(reset-password|verify-email)',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ]
  },

  turbopack: {
    // Pin the project root: there may be an unrelated package-lock.json
    // higher up in the home folder that Turbopack would otherwise consider.
    root: __dirname,
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
