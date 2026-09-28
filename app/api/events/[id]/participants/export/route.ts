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

// Participants CSV export. Same rows as the table endpoint, RFC 4180
// escaped by the shared toCsv helper.
export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    await assertEventOrganizer(session.user, eventId)
    const rows = await listDashboardParticipants(eventId)
    const csv = toCsv(
      ['email', 'name', 'organization', 'team', 'team_role', 'registered_at'],
      rows.map((row) => [row.email, row.name, row.organization, row.teamName, row.memberRole, row.registeredAt]),
    )
    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="event-${eventId}-participants.csv"`,
      },
    })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
