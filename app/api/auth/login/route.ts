import { NextResponse } from 'next/server'
import { loginRequestSchema } from '@/src/lib/api/schemas'
import { authenticate, createSession } from '@/src/server/auth-service'
import { authErrorResponse, parseBody, publicUser, routeContext, withSessionCookie } from '@/src/server/http'

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, loginRequestSchema)
    const user = await authenticate(body.email, body.password)
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
