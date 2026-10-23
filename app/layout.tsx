// ROOT LAYOUT: only what every page needs: <html>/<body>, fonts, the
// no-flash theme script, the skip link, the header and the footer.

import type { Metadata, Viewport } from 'next'
import { Fira_Sans, Fraunces } from 'next/font/google'
import { Suspense } from 'react'
import { DemoBanner } from '@/components/site/demo-banner'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'
import { site } from '@/lib/site'
import { themeScript } from '@/lib/theme'
import './globals.css'

// next/font downloads the fonts at build time and serves them from this
// site: no request to Google from the visitor's browser and no layout jump.
//   FRAUNCES: a soft "wonky" old-style serif with an optical-size axis: it
//     reads like the hand-lettered name board of a good guesthouse. HEADINGS
//     ONLY, which never carry a price (it has no ₦ glyph).
//   FIRA SANS: designed for small screens, very readable at 15px on a phone,
//     with the ₦ sign and TABULAR figures, so prices line up in a breakdown.
const fraunces = Fraunces({ subsets: ['latin', 'latin-ext'], axes: ['SOFT', 'opsz'], variable: '--font-fraunces' })
const fira = Fira_Sans({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700'], variable: '--font-fira-sans' })

export const metadata: Metadata = {
  title: { default: `${site.name}: ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3F2EF' },
    { media: '(prefers-color-scheme: dark)', color: '#17161B' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-NG" suppressHydrationWarning className={`${fraunces.variable} ${fira.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-dvh flex-col text-base leading-relaxed antialiased">
        <a href="#main" className="sr-only z-[1000] rounded-control bg-primary px-4 py-2 font-semibold text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
          Skip to content
        </a>
        <SiteHeader />
        <Suspense fallback={null}>
          <DemoBanner />
        </Suspense>
        <main id="main" className="flex w-full flex-1 flex-col">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  )
}
