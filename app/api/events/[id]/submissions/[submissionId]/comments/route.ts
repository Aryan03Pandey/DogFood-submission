import { NextResponse } from 'next/server'
import { commentHideSchema, commentPostSchema } from '@/src/lib/api/schemas'
import { hideComment, listComments, postComment } from '@/src/server/comment-service'
import { getSessionUser } from '@/src/server/auth-service'
import {
  authErrorResponse,
  getRequestToken,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string; submissionId: string }>
}

// Public thread; organizers also see moderated (hidden) comments.
export async function GET(request: Request, { params }: Params) {
  try {
    const { submissionId } = await params
    const viewer = await getSessionUser(await getRequestToken())
    return NextResponse.json(await listComments(viewer?.user ?? null, submissionId))
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

// Posting needs a session (spam control).
export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { submissionId } = await params
    const body = await parseBody(request, commentPostSchema)
    return NextResponse.json(
      { comment: await postComment(session.user, submissionId, body.body) },
      { status: 201 },
    )
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

// Organizer moderation (soft hide).
export async function DELETE(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { submissionId } = await params
    const body = await parseBody(request, commentHideSchema)
    return NextResponse.json(await hideComment(session.user, submissionId, body.commentId))
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
