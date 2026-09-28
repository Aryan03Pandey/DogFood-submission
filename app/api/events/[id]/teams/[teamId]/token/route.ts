import { NextResponse } from 'next/server'
import { rotateInviteToken } from '@/src/server/team-service'
import {
  authErrorResponse,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string; teamId: string }>
}

// Leader-only invite rotation. Returns the new plaintext token once.
export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { teamId } = await params
    return NextResponse.json(await rotateInviteToken(session.user, teamId), { status: 201 })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
