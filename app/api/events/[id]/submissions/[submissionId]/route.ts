import { NextResponse } from 'next/server'
import { passwordConfirmSchema, updateSubmissionSchema } from '@/src/lib/api/schemas'
import { deleteDraft, updateDraft } from '@/src/server/submission-service'
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string; submissionId: string }>
}

// Save draft target: the updatedAt precondition is the conflict
// protocol (409 STALE_DRAFT → refetch, never overwrite).
export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId, submissionId } = await params
    const body = await parseBody(request, updateSubmissionSchema)
    return NextResponse.json({
      submission: await updateDraft(session.user, eventId, submissionId, body),
    })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

// Draft-only, leader-only, password-confirmed delete. Stored bytes are
// best-effort removed from seaweedfs; the row delete never waits on that.
export async function DELETE(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId, submissionId } = await params
    const body = await parseBody(request, passwordConfirmSchema)
    const result = await deleteDraft(session.user, eventId, submissionId, body.password)
    const filer = (process.env.SEAWEEDFS_FILER_URL ?? 'http://seaweedfs:8888').replace(/\/$/, '')
    const bucket = process.env.S3_BUCKET ?? 'dogfood-assets'
    await Promise.all(
      result.assetKeys.map((key) =>
        fetch(`${filer}/${bucket}/${key}`, { method: 'DELETE' }).catch(() => null),
      ),
    )
    return NextResponse.json({ submissionId: result.submissionId, deleted: result.deleted })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
