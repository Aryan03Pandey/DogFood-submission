import { NextResponse } from 'next/server'
import { assignEventRoleRequestSchema, removeEventRoleRequestSchema } from '@/src/lib/api/schemas'
import { assignEventRole, getEffectiveRole, listEventRoles } from '@/src/server/auth-service'
import { removeEventRole } from '@/src/server/dashboard-service'
import { authErrorResponse, parseBody, requireSession, routeContext } from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

function serializeRole(row: { id: string; eventId: string; userId: string; role: string; createdAt: Date }) {
  return {
    id: row.id,
    eventId: row.eventId,
    userId: row.userId,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    const role = await getEffectiveRole(session.user, eventId)
    if (role !== 'SUPERADMIN' && role !== 'ORGANIZER') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
    }
    const rows = await listEventRoles(eventId)
    return NextResponse.json({ eventId, roles: rows.map(serializeRole) })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    const body = await parseBody(request, assignEventRoleRequestSchema)
    const row = await assignEventRole({
      actor: session.user,
      eventId,
      targetUserId: body.userId,
      role: body.role,
    })
    return NextResponse.json(serializeRole(row), { status: 201 })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

// Organizer removal (Event Settings). Organizers and superadmins only;
// nobody can remove their own mapping (no self-lockout).
export async function DELETE(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    const body = await parseBody(request, removeEventRoleRequestSchema)
    await removeEventRole(session.user, eventId, body.userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
