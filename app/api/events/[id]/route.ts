import { NextResponse } from 'next/server'
import { passwordConfirmSchema, updateEventSchema } from '@/src/lib/api/schemas'
import { deleteEvent } from '@/src/server/dashboard-service'
import { getEvent, serializeEvent, updateEvent } from '@/src/server/event-service'
import { getSessionUser } from '@/src/server/auth-service'
import {
  authErrorResponse,
  getRequestToken,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await getSessionUser(await getRequestToken())
    const { id: eventId } = await params
    return NextResponse.json(serializeEvent(await getEvent(eventId, viewer?.user ?? null)))
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    const body = await parseBody(request, updateEventSchema)
    return NextResponse.json(serializeEvent(await updateEvent(session.user, eventId, body)))
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

// Admin-dashboard delete (Event Settings). SUPERADMINs only (organizers
// manage content but cannot destroy the event — enforced in the service),
// confirmed with the actor's password; dependent rows cascade or are
// removed explicitly in the service.
export async function DELETE(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    const body = await parseBody(request, passwordConfirmSchema)
    return NextResponse.json(await deleteEvent(session.user, eventId, body.password))
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
