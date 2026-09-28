import { NextResponse } from 'next/server'
import { ImportError, importData } from '@/src/server/import-service'
import { authErrorResponse, jsonError, requireSession, routeContext } from '@/src/server/http'

const MAX_IMPORT_BYTES = 25 * 1024 * 1024 // 25 MB

// SUPERADMIN only — this can rewrite the whole instance. App Router route
// handlers enforce no body size limit on their own, so Content-Length is
// checked explicitly before request.json() ever buffers the body.
export async function POST(request: Request) {
  try {
    const session = await requireSession()
    if (session.user.role !== 'SUPERADMIN') return jsonError('FORBIDDEN', 403)

    const contentLength = Number(request.headers.get('content-length') ?? '0')
    if (contentLength > MAX_IMPORT_BYTES) return jsonError('PAYLOAD_TOO_LARGE', 413)

    const body = await request.json().catch(() => null)
    const url = new URL(request.url)
    const summary = await importData(body, {
      dryRun: url.searchParams.get('dryRun') === 'true',
      force: url.searchParams.get('force') === 'true',
      actorId: session.user.id,
    })
    return NextResponse.json(summary)
  } catch (error) {
    if (error instanceof ImportError) return jsonError(error.code, error.status)
    return authErrorResponse(error, routeContext(request))
  }
}
