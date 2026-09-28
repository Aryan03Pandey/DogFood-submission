import { NextResponse } from 'next/server'
import { getEventAuditLogs } from '@/src/server/audit-service'
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
    const logs = await getEventAuditLogs(session.user, eventId)
    return NextResponse.json({ logs })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}