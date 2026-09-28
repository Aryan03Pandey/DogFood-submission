import { NextResponse } from 'next/server'
import { castVoteSchema } from '@/src/lib/api/schemas'
import { castVote, resetVote } from '@/src/server/voting-service'
import {
  generateVoterFingerprint,
  validateHoneypot,
  validateSubmissionTiming,
} from '@/src/server/anti-abuse-service'
import { getSessionUser } from '@/src/server/auth-service'
import {
  authErrorResponse,
  getRequestToken,
  parseBody,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: eventId } = await params

    const session = await getSessionUser(await getRequestToken())
    const body = await parseBody(request, castVoteSchema)

    validateHoneypot(body.honeypot)
    validateSubmissionTiming(body.formRenderedAt, 600)

    const fingerprint = generateVoterFingerprint(request, session?.user.id)
    // The schema defaults allocation votes to 1 at parse time; spell it out
    // so the service contract (votes required) typechecks as written.
    const result = await castVote(session?.user ?? null, eventId, fingerprint, {
      ...body,
      allocations: body.allocations?.map((allocation) => ({
        submissionId: allocation.submissionId,
        votes: allocation.votes ?? 1,
      })),
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id: eventId } = await params

    const session = await getSessionUser(await getRequestToken())
    const fingerprint = generateVoterFingerprint(request, session?.user.id)
    const result = await resetVote(session?.user ?? null, eventId, fingerprint)

    return NextResponse.json(result)
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}