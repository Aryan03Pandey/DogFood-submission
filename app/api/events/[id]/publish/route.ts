import { NextResponse } from 'next/server'
import { passwordConfirmSchema } from '@/src/lib/api/schemas'
import { publishEvent, serializeEvent } from '@/src/server/event-service'
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

// Go-live (ADMIN-DASHBOARD.md Event Settings). Moves a DRAFT to
// REGISTRATION so the phase clock takes over and the event joins the live
// list; re-publishing conflicts. Needs the actor's password.
export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    const body = await parseBody(request, passwordConfirmSchema)
    return NextResponse.json(serializeEvent(await publishEvent(session.user, eventId, body.password)))
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
