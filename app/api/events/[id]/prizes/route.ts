import { NextResponse } from 'next/server'
import { createPrizeSchema } from '@/src/lib/api/schemas'
import { createPrize, listPrizes, serializePrize } from '@/src/server/event-service'
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
    const rows = await listPrizes(eventId, viewer?.user ?? null)
    return NextResponse.json({ eventId, prizes: rows.map(serializePrize) })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    const body = await parseBody(request, createPrizeSchema)
    const row = await createPrize(session.user, eventId, body)
    return NextResponse.json(serializePrize(row), { status: 201 })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
