import { NextResponse } from 'next/server'
import { getEffectiveRole } from '@/src/server/auth-service'
import { eventExists, exportEvent } from '@/src/server/export-service'
import { authErrorResponse, jsonError, requireSession, routeContext } from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

// ORGANIZER of this event, or SUPERADMIN. Never accepts --include-credentials
// (that flag exists only on the CLI) — password hashes never leave over HTTP.
export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    if (!(await eventExists(eventId))) return jsonError('EVENT_NOT_FOUND', 404)
    const role = await getEffectiveRole(session.user, eventId)
    if (role !== 'SUPERADMIN' && role !== 'ORGANIZER') return jsonError('FORBIDDEN', 403)
    const envelope = await exportEvent(eventId, { actorId: session.user.id })
    return NextResponse.json(envelope, {
      headers: { 'content-disposition': `attachment; filename="event-${eventId}-export.json"` },
    })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
