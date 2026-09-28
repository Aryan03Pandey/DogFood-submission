import { NextResponse } from 'next/server'
import { joinTeamSchema } from '@/src/lib/api/schemas'
import { joinTeamByToken } from '@/src/server/team-service'
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

// Join by pasted code or ?token= link. Unknown codes 404, expired codes
// 410, full or frozen teams 409.
export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    const body = await parseBody(request, joinTeamSchema)
    return NextResponse.json({ team: await joinTeamByToken(session.user, eventId, body.token) })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
