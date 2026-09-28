import { NextResponse } from 'next/server'
import { createEventSchema } from '@/src/lib/api/schemas'
import { createEvent, listEvents, serializeEvent } from '@/src/server/event-service'
import { getSessionUser } from '@/src/server/auth-service'
import {
  authErrorResponse,
  getRequestToken,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

export async function GET(request: Request) {
  try {
    const viewer = await getSessionUser(await getRequestToken())
    const rows = await listEvents(viewer?.user ?? null)
    return NextResponse.json({ events: rows.map(serializeEvent) })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession()
    const body = await parseBody(request, createEventSchema)
    const row = await createEvent(session.user, body)
    return NextResponse.json(serializeEvent(row), { status: 201 })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
