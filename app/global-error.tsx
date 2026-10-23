// The last resort: an error in the ROOT layout itself. It replaces the whole
// document, so it brings its own <html> and <body> and only inline styles
// (globals.css may not have loaded). The colours are the palette's own
// Lavender and Oxford Blue, written out because the tokens aren't there.
'use client'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-NG">
      <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#D9E1F1', color: '#192338', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ maxWidth: '28rem', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.75rem' }}>Staybook hit a problem</h1>
          <p>Something went wrong while loading the app. Nothing half-saved: every save is all-or-nothing.</p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: '1rem', padding: '0.7rem 1.2rem', borderRadius: '0.3rem', border: 0, background: '#31487A', color: '#D9E1F1', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
