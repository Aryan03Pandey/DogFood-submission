import { NextResponse } from 'next/server'
import { listDashboardGallery } from '@/src/server/dashboard-service'
import { assertEventOrganizer } from '@/src/server/event-service'
import {
  authErrorResponse,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

// Gallery tab source: every submission for the event with its visibility
// flag, so organizers can hide projects from the public gallery.
export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    await assertEventOrganizer(session.user, eventId)
    return NextResponse.json({ items: await listDashboardGallery(eventId) })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
