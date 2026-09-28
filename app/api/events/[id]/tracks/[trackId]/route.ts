import { NextResponse } from 'next/server'
import { updateTrackSchema } from '@/src/lib/api/schemas'
import { deleteTrack, serializeTrack, updateTrack } from '@/src/server/event-service'
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string; trackId: string }>
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId, trackId } = await params
    const body = await parseBody(request, updateTrackSchema)
    return NextResponse.json(serializeTrack(await updateTrack(session.user, eventId, trackId, body)))
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId, trackId } = await params
    await deleteTrack(session.user, eventId, trackId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
