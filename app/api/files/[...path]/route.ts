import { NextResponse } from 'next/server'

interface Params {
  params: Promise<{ path: string[] }>
}

// Same-origin file reads for SeaweedFS filer assets (event logos, banners,
// cards). Browsers must never fetch the filer directly: its address is a
// localhost/compose hostname that is unreachable — and private-network
// blocked — from any visitor, especially behind a tunnel or domain.
// This route streams server-side (the in-compose filer hostname works here)
// and the browser only ever sees /api/files/… .
// Files are public gallery/event assets; no auth. Path traversal is refused.
export async function GET(_request: Request, { params }: Params) {
  const { path } = await params
  if (!path || path.length === 0 || path.some((seg) => seg === '' || seg === '.' || seg === '..')) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }
  if (path.some((seg) => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(seg))) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }
  const filer = (process.env.SEAWEEDFS_FILER_URL ?? 'http://seaweedfs:8888').replace(/\/$/, '')
  let upstream: Response
  try {
    upstream = await fetch(`${filer}/${path.join('/')}`)
  } catch {
    return NextResponse.json({ error: 'UPSTREAM_UNAVAILABLE' }, { status: 502 })
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }
  const headers = new Headers()
  const contentType = upstream.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)
  const contentLength = upstream.headers.get('content-length')
  if (contentLength) headers.set('content-length', contentLength)
  headers.set('cache-control', 'public, max-age=86400')
  return new Response(upstream.body, { headers })
}
