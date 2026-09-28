import { NextResponse } from 'next/server'
import { teamMemberSchema } from '@/src/lib/api/schemas'
import { kickMember } from '@/src/server/team-service'
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string; teamId: string }>
}

// Leader-only kick. Self-removal goes through leave.
export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { teamId } = await params
    const body = await parseBody(request, teamMemberSchema)
    return NextResponse.json({ team: await kickMember(session.user, teamId, body.userId) })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
