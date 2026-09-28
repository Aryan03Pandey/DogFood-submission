import { NextResponse } from 'next/server'
import { impersonateRequestSchema } from '@/src/lib/api/schemas'
import { createSession, findUserByEmail, isImpersonationEnabled, AuthError } from '@/src/server/auth-service'
import { authErrorResponse, parseBody, publicUser, routeContext, withSessionCookie } from '@/src/server/http'

// Offline dev only: mint a session for a seeded user without a password.
// Disabled in production or when OFFLINE_MODE is not "true".
export async function POST(request: Request) {
  try {
    if (!isImpersonationEnabled()) throw new AuthError('NOT_FOUND', 404)
    const body = await parseBody(request, impersonateRequestSchema)
    const user = await findUserByEmail(body.email)
    if (!user) throw new AuthError('USER_NOT_FOUND', 404)
    const session = await createSession(user.id)
    return withSessionCookie(
      NextResponse.json({ user: publicUser(user), expiresAt: session.expiresAt.toISOString() }),
      session.token,
      request,
    )
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
