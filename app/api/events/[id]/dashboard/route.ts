import { NextResponse } from 'next/server'
import { getDashboardOverview } from '@/src/server/dashboard-service'
import { assertEventOrganizer } from '@/src/server/event-service'
import {
  authErrorResponse,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

// Admin-dashboard overview aggregates (ADMIN-DASHBOARD.md Overview tab).
// Organizers and superadmins only.
export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    await assertEventOrganizer(session.user, eventId)
    return NextResponse.json(await getDashboardOverview(eventId))
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
