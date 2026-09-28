import { NextResponse } from 'next/server'
import { updatePrizeSchema } from '@/src/lib/api/schemas'
import { deletePrize, serializePrize, updatePrize } from '@/src/server/event-service'
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string; prizeId: string }>
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId, prizeId } = await params
    const body = await parseBody(request, updatePrizeSchema)
    return NextResponse.json(serializePrize(await updatePrize(session.user, eventId, prizeId, body)))
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId, prizeId } = await params
    await deletePrize(session.user, eventId, prizeId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
