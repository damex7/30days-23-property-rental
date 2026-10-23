// POST /api/photos/upload: issues a ONE-TIME UPLOAD TOKEN for Vercel Blob.
//
// The photo itself never comes here: the browser uploads it straight to
// Blob with the token (lib/services/photos.ts explains why). This route
// only decides whether that upload may happen, and on what terms:
//   - signed in, and the listing in clientPayload is YOUR listing (else 404);
//   - room left (under 12 photos);
//   - the pathname is listings/<that listing>/<random>.<jpg|png|webp>;
//   - the token only accepts JPEG, PNG or WebP, at most 5 MB, for 10 minutes.
// Rate-limited per user, and same-origin only (route handlers don't get
// Server Actions' built-in Origin check).
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getCurrentSession } from '@/lib/auth/dal'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { getRequestInfo, isSameOrigin } from '@/lib/auth/request'
import { isServiceError } from '@/lib/services/errors'
import { authorizeUpload } from '@/lib/services/photos'

const payloadSchema = z.object({ listingId: z.uuid() })

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null
  if (!body) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })

  // Blob's own "upload completed" call comes server to server, with no
  // cookie or Origin. handleUpload verifies ITS signature, so it skips the
  // browser checks below.
  if (body.type === 'blob.upload-completed') {
    try {
      return NextResponse.json(await handleUpload({ body, request, onBeforeGenerateToken: async () => ({}), onUploadCompleted: async ({ blob }) => console.log(`[photos] upload completed: ${blob.pathname}`) }))
    } catch {
      return NextResponse.json({ error: 'Bad signature.' }, { status: 400 })
    }
  }

  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 })
  const current = await getCurrentSession()
  if (!current) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  const limit = await checkRateLimit('upload', (await getRequestInfo()).ip, current.user.id)
  if (!limit.ok) return NextResponse.json({ error: limit.message }, { status: 429 })

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = payloadSchema.safeParse(JSON.parse(clientPayload ?? 'null'))
        if (!payload.success) throw new Error('Missing listing.')
        const terms = await authorizeUpload(current.user, payload.data.listingId, pathname)
        return { ...terms, tokenPayload: JSON.stringify({ listingId: payload.data.listingId, userId: current.user.id }) }
      },
      // Without onUploadCompleted here, Blob isn't asked to call back: the
      // photo is saved when the BROWSER reports it, with its alt text
      // (Blob's callback can't reach localhost anyway).
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = isServiceError(error) ? error.message : error instanceof Error ? error.message : 'Upload refused.'
    return NextResponse.json({ error: message }, { status: isServiceError(error) ? error.status : 400 })
  }
}
