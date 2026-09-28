import { NextResponse } from 'next/server'
import { appendAsset, removeAsset } from '@/src/server/submission-service'
import { removeAssetSchema } from '@/src/lib/api/schemas'
import { SUBMISSION_ASSET_MIME } from '@/src/lib/submissions'
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string; submissionId: string }>
}

function safeName(filename: string): string {
  const base = filename
    .split('/')
    .pop()!
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80)
  return base === '' || base === '.' ? 'asset' : base
}

// Submission asset upload (SUBMISSIONS.md). The bytes go straight to the
// SeaweedFS filer under a key scoped to event + submission; only the key
// (plus name/size/mime for the budget meter) is recorded on the draft.
// Only the total cap is enforced — a single file may use the whole budget.
export async function POST(request: Request, { params }: Params) {
  const t0 = Date.now()
  // eslint-disable-next-line no-console
  console.log('[asset-upload] POST assets: hit')
  try {
    const session = await requireSession()
    const { id: eventId, submissionId } = await params
    // eslint-disable-next-line no-console
    console.log('[asset-upload] POST assets: user =', session.user.email, ', event =', eventId, ', submission =', submissionId)
    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    // eslint-disable-next-line no-console
    console.log('[asset-upload] POST assets: form parsed, file =', file instanceof File ? `${file.name} ${file.size}B ${file.type}` : typeof file)
    if (!(file instanceof File) || file.size === 0) {
      // eslint-disable-next-line no-console
      console.log('[asset-upload] POST assets: -> 400 MISSING_FILE')
      return NextResponse.json({ error: 'MISSING_FILE' }, { status: 400 })
    }
    if (!(SUBMISSION_ASSET_MIME as readonly string[]).includes(file.type)) {
      // eslint-disable-next-line no-console
      console.log('[asset-upload] POST assets: -> 400 UNSUPPORTED_TYPE', file.type)
      return NextResponse.json({ error: 'UNSUPPORTED_TYPE' }, { status: 400 })
    }
    const bucket = process.env.S3_BUCKET ?? 'dogfood-assets'
    const filer = (process.env.SEAWEEDFS_FILER_URL ?? 'http://seaweedfs:8888').replace(/\/$/, '')
    // Random suffix: two files saved in the same millisecond must never
    // share a key, or one Remove would orphan the other's bytes.
    const nonce = Math.random().toString(36).slice(2, 10)
    const key = `submissions/${eventId}/${submissionId}-${Date.now()}-${nonce}-${safeName(file.name)}`
    // eslint-disable-next-line no-console
    console.log('[asset-upload] POST assets: forwarding to filer', `${filer}/${bucket}/${key}`)
    const forward = new FormData()
    forward.append('file', file, file.name)
    let stored: Response
    try {
      stored = await fetch(`${filer}/${bucket}/${key}`, { method: 'POST', body: forward })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('[asset-upload] POST assets: filer fetch threw', String(err))
      return NextResponse.json({ error: 'UPLOAD_FAILED' }, { status: 502 })
    }
    // eslint-disable-next-line no-console
    console.log('[asset-upload] POST assets: filer responded', stored.status, `in ${Date.now() - t0}ms`)
    if (!stored.ok) {
      return NextResponse.json({ error: 'UPLOAD_FAILED' }, { status: 502 })
    }
    try {
      const result = await appendAsset(session.user, eventId, submissionId, {
        key,
        name: file.name,
        sizeBytes: file.size,
        mime: file.type,
      })
      // eslint-disable-next-line no-console
      console.log('[asset-upload] POST assets: -> 201, usedBytes =', result.usedBytes, `in ${Date.now() - t0}ms`)
      return NextResponse.json(
        { submission: result.summary, usedBytes: result.usedBytes, totalBytes: result.totalBytes },
        { status: 201 },
      )
    } catch (error) {
      // Bytes landed but the draft refused them (budget, lock, deadline):
      // remove the orphan so storage never bills for rejected uploads.
      // eslint-disable-next-line no-console
      console.log('[asset-upload] POST assets: appendAsset threw, cleaning orphan', key)
      await fetch(`${filer}/${bucket}/${key}`, { method: 'DELETE' }).catch(() => null)
      return authErrorResponse(error, routeContext(request))
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('[asset-upload] POST assets: outer catch', String(error))
    return authErrorResponse(error, routeContext(request))
  }
}

// Asset removal (SUBMISSIONS.md): drops the key from the draft, then
// best-effort deletes the bytes from the SeaweedFS filer. The DB write wins:
// a failed filer delete only orphans bytes, never corrupts the draft.
export async function DELETE(request: Request, { params }: Params) {
  // eslint-disable-next-line no-console
  console.log('[asset-upload] DELETE assets: hit')
  try {
    const session = await requireSession()
    const { id: eventId, submissionId } = await params
    const body = await parseBody(request, removeAssetSchema)
    // eslint-disable-next-line no-console
    console.log('[asset-upload] DELETE assets: user =', session.user.email, ', key =', body.key)
    const submission = await removeAsset(session.user, eventId, submissionId, body.key)
    const bucket = process.env.S3_BUCKET ?? 'dogfood-assets'
    const filer = (process.env.SEAWEEDFS_FILER_URL ?? 'http://seaweedfs:8888').replace(/\/$/, '')
    const filerRes = await fetch(`${filer}/${bucket}/${body.key}`, { method: 'DELETE' }).catch(() => null)
    // eslint-disable-next-line no-console
    console.log('[asset-upload] DELETE assets: filer delete =', filerRes?.status ?? 'fetch-threw', ', remaining =', submission.assets.length)
    return NextResponse.json({ submission })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
