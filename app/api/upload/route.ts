import { NextResponse } from 'next/server'
import { assertEventOrganizer } from '@/src/server/event-service'
import {
  buildStorageKey,
  publicUploadUrl,
  uploadErrorFor,
  type UploadSlot,
} from '@/src/lib/upload'
import {
  authErrorResponse,
  requireSession,
  routeContext,
} from '@/src/server/http'

const SLOTS: UploadSlot[] = ['logo', 'banner', 'card']

// Event media upload (EVENT-CREATION.md Step 1). The file is validated here
// (type + size allowlist) and forwarded to the SeaweedFS filer; only the
// public URL is returned — nothing is stored locally. Uploading requires an
// organizer mapping on the target event, and the storage key is scoped to
// that event so uploads cannot land outside it.
export async function POST(request: Request) {
  try {
    const session = await requireSession()
    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    const eventId = form?.get('eventId')
    const slot = form?.get('slot')

    if (!(file instanceof File) || typeof eventId !== 'string' || eventId === '') {
      return NextResponse.json({ error: 'MISSING_FILE' }, { status: 400 })
    }
    if (typeof slot !== 'string' || !(SLOTS as string[]).includes(slot)) {
      return NextResponse.json({ error: 'INVALID_SLOT' }, { status: 400 })
    }
    await assertEventOrganizer(session.user, eventId)

    const rejected = uploadErrorFor({ mime: file.type, sizeBytes: file.size, filename: file.name })
    if (rejected) {
      return NextResponse.json({ error: rejected }, { status: 400 })
    }

    const bucket = process.env.S3_BUCKET ?? 'dogfood-assets'
    const filer = (process.env.SEAWEEDFS_FILER_URL ?? 'http://seaweedfs:8888').replace(/\/$/, '')
    const key = buildStorageKey(slot as UploadSlot, eventId, file.name)

    const forward = new FormData()
    forward.append('file', file, file.name)
    let stored: Response
    try {
      stored = await fetch(`${filer}/${bucket}/${key}`, { method: 'POST', body: forward })
    } catch {
      return NextResponse.json({ error: 'UPLOAD_FAILED' }, { status: 502 })
    }
    if (!stored.ok) {
      return NextResponse.json({ error: 'UPLOAD_FAILED' }, { status: 502 })
    }

    return NextResponse.json({
      url: publicUploadUrl(`${bucket}/${key}`),
      path: `${bucket}/${key}`,
      mime: file.type,
      sizeBytes: file.size,
    })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
