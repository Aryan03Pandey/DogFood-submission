import { NextResponse } from 'next/server'
import { createTeamSchema } from '@/src/lib/api/schemas'
import { createTeam, getMyTeam } from '@/src/server/team-service'
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

// Own team read (null when teamless) and team creation. Creation makes the
// caller LEADER and returns the invite token once — only its hash is stored.
export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    return NextResponse.json({ team: await getMyTeam(session.user, eventId) })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    const body = await parseBody(request, createTeamSchema)
    const { summary, token } = await createTeam(session.user, eventId, body.name)
    return NextResponse.json({ team: summary, token }, { status: 201 })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
