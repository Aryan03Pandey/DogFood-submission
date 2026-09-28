import { NextResponse } from 'next/server'
import { listDashboardSubmissions, toCsv } from '@/src/server/dashboard-service'
import { assertEventOrganizer } from '@/src/server/event-service'
import {
  authErrorResponse,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

// Submissions CSV export. Same rows as the table endpoint.
export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    await assertEventOrganizer(session.user, eventId)
    const rows = await listDashboardSubmissions(eventId)
    const csv = toCsv(
      ['title', 'team', 'track', 'status', 'hidden', 'repo_url', 'demo_url', 'submitted_at', 'updated_at'],
      rows.map((row) => [
        row.title,
        row.teamName,
        row.trackName,
        row.status,
        row.isHidden ? 'yes' : 'no',
        row.repoUrl,
        row.demoUrl,
        row.submittedAt,
        row.updatedAt,
      ]),
    )
    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="event-${eventId}-submissions.csv"`,
      },
    })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
