import { NextResponse } from 'next/server'
import { listDashboardParticipants, toCsv } from '@/src/server/dashboard-service'
import { assertEventOrganizer } from '@/src/server/event-service'
import {
  authErrorResponse,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

// Participants table source (ADMIN-DASHBOARD.md Participants tab).
// Organizers and superadmins only; sorting/searching happens client-side.
export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    await assertEventOrganizer(session.user, eventId)
    return NextResponse.json({ participants: await listDashboardParticipants(eventId) })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
