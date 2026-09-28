import { NextResponse } from 'next/server'
import { passwordConfirmSchema, renameTeamSchema } from '@/src/lib/api/schemas'
import { deleteTeam, renameTeam } from '@/src/server/team-service'
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string; teamId: string }>
}

// Leader-only rename. Leader-only delete, confirmed with the actor's
// password; cancelling unregisters every member from the event, and
// submitted (locked) teams can still be cancelled.
export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { teamId } = await params
    const body = await parseBody(request, renameTeamSchema)
    return NextResponse.json({ team: await renameTeam(session.user, teamId, body.name) })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { teamId } = await params
    const body = await parseBody(request, passwordConfirmSchema)
    return NextResponse.json(await deleteTeam(session.user, teamId, body.password))
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
