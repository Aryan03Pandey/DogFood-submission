import { NextResponse } from 'next/server'
import { passwordConfirmSchema } from '@/src/lib/api/schemas'
import { submitTeam } from '@/src/server/team-service'
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string; teamId: string }>
}

// Team-level submit: any member finalizes a complete roster with their own
// password. The lock is irreversible.
export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { teamId } = await params
    const body = await parseBody(request, passwordConfirmSchema)
    return NextResponse.json({ team: await submitTeam(session.user, teamId, body.password) })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
