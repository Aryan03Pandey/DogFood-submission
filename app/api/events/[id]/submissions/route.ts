import { NextResponse } from 'next/server'
import { createSubmissionSchema, submissionPageQuerySchema } from '@/src/lib/api/schemas'
import { listDashboardSubmissionsPage } from '@/src/server/dashboard-service'
import { assertEventOrganizer } from '@/src/server/event-service'
import { createDraft } from '@/src/server/submission-service'
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

// Submissions table source (ADMIN-DASHBOARD.md Submissions tab).
// Supports pagination plus search/filter via query params:
// ?page=2&pageSize=10&query=llm&status=final&track=Local%20AI
// Organizers and superadmins only.
export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    await assertEventOrganizer(session.user, eventId)
    const url = new URL(request.url)
    const query = submissionPageQuerySchema.parse({
      page: url.searchParams.get('page') ?? undefined,
      pageSize: url.searchParams.get('pageSize') ?? undefined,
      query: url.searchParams.get('query') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      track: url.searchParams.get('track') ?? undefined,
    })
    const page = await listDashboardSubmissionsPage(eventId, query)
    return NextResponse.json({ submissions: page.rows, total: page.total, page: page.page, pageSize: page.pageSize, tracks: page.tracks })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

// Draft creation (idempotent per team): trackless by default, the team
// picks a track in the form; finalize requires one.
export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    const body = await parseBody(request, createSubmissionSchema)
    return NextResponse.json(
      { submission: await createDraft(session.user, eventId, body) },
      { status: 201 },
    )
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
