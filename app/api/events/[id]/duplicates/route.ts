import { NextResponse } from 'next/server'
import { detectDuplicateSubmissions } from '@/src/server/voting-service'
import {
  authErrorResponse,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    const duplicates = await detectDuplicateSubmissions(session.user, eventId)
    return NextResponse.json({ duplicates })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}