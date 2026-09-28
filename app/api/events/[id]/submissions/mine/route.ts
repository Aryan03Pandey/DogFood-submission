import { NextResponse } from 'next/server'
import { getMySubmission } from '@/src/server/submission-service'
import {
  authErrorResponse,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

// Own-team submission read for the submit page. Null when there is nothing
// yet — the page then offers a track picker that POSTs a draft.
export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    return NextResponse.json({ submission: await getMySubmission(session.user, eventId) })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
