import { NextResponse } from 'next/server'
import { z } from 'zod'
import { findUserByEmail, setGlobalRole } from '@/src/server/auth-service'
import { roleSchema } from '@/src/lib/api/schemas'
import { managesAnyEvent } from '@/src/server/event-service'
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

// Email → user lookup for the organizer editor (Event Settings). Only
// users who manage at least one event (or superadmins) may resolve
// arbitrary emails; the response carries no credentials.
export async function GET(request: Request) {
  try {
    const session = await requireSession()
    if (!(await managesAnyEvent(session.user))) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
    }
    const email = new URL(request.url).searchParams.get('email')?.trim() ?? ''
    if (email === '') return NextResponse.json({ users: [] })
    const user = await findUserByEmail(email)
    if (!user) return NextResponse.json({ users: [] })
    return NextResponse.json({
      users: [{ id: user.id, email: user.email, name: user.name }],
    })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

const setRoleSchema = z.object({ userId: z.string().uuid(), role: roleSchema })

// Global role grant for the Event Settings "Admin" option. SUPERADMIN-only:
// promotes (or demotes) a user's instance-wide flag. Event-scoped grants
// stay on /api/events/[id]/roles.
export async function PATCH(request: Request) {
  try {
    const session = await requireSession()
    const body = await parseBody(request, setRoleSchema)
    const updated = await setGlobalRole(session.user, body.userId, body.role)
    return NextResponse.json({ id: updated.id, role: updated.role })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
