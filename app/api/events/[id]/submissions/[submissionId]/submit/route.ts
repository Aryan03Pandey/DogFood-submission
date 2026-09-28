import { NextResponse } from 'next/server'
import { passwordConfirmSchema } from '@/src/lib/api/schemas'
import { finalizeSubmission } from '@/src/server/team-service'
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string; submissionId: string }>
}

// Submission finalize: leader-only, password-confirmed. Flips DRAFT →
// submitted and locks the team roster in one transaction.
export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId, submissionId } = await params
    const body = await parseBody(request, passwordConfirmSchema)
    return NextResponse.json(
      await finalizeSubmission(session.user, eventId, submissionId, body.password),
      { status: 201 },
    )
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
