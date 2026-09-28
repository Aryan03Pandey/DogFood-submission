import { NextResponse } from 'next/server'
import { createTrackSchema } from '@/src/lib/api/schemas'
import { createTrack, listTracks, serializeTrack } from '@/src/server/event-service'
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
    const rows = await listTracks(eventId, viewer?.user ?? null)
    return NextResponse.json({ eventId, tracks: rows.map(serializeTrack) })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    const body = await parseBody(request, createTrackSchema)
    const row = await createTrack(session.user, eventId, body)
    return NextResponse.json(serializeTrack(row), { status: 201 })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
