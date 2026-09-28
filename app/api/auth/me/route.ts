import { NextResponse } from 'next/server'
import { listUserEventRoles } from '@/src/server/auth-service'
import { authErrorResponse, publicUser, requireSession, routeContext } from '@/src/server/http'

export async function GET(request: Request) {
  try {
    const session = await requireSession()
    const rows = await listUserEventRoles(session.user.id)
    return NextResponse.json({
      user: publicUser(session.user),
      expiresAt: session.expiresAt.toISOString(),
      eventRoles: rows.map((row) => ({
        id: row.id,
        eventId: row.eventId,
        userId: row.userId,
        role: row.role,
        createdAt: row.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
