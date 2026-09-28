import { NextResponse } from 'next/server'
import { passwordConfirmSchema } from '@/src/lib/api/schemas'
import { registerForEvent, unregisterFromEvent } from '@/src/server/event-service'
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

// Participant self-registration. Signed-in users only; the service refuses
// closed events (409), incomplete profiles (422), and never touches
// JUDGE/ORGANIZER mappings.
export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    const result = await registerForEvent(session.user, eventId)
    return NextResponse.json(
      { eventId, registered: true, role: result.role },
      { status: result.created ? 201 : 200 },
    )
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    const body = await parseBody(request, passwordConfirmSchema)
    await unregisterFromEvent(session.user, eventId, body.password)
    return NextResponse.json({ eventId, registered: false })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
