import { NextResponse } from 'next/server'
import { leaveTeam } from '@/src/server/team-service'
import {
  authErrorResponse,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string; teamId: string }>
}

// Leave the team. Leaders hand ownership to the longest-tenured member;
// the last member out deletes the team.
export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { teamId } = await params
    return NextResponse.json(await leaveTeam(session.user, teamId))
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
