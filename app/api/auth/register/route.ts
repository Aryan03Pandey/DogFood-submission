import { NextResponse } from 'next/server'
import { registerRequestSchema } from '@/src/lib/api/schemas'
import { createSession, createUser } from '@/src/server/auth-service'
import { authErrorResponse, parseBody, publicUser, routeContext, withSessionCookie } from '@/src/server/http'

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, registerRequestSchema)
    const user = await createUser({ email: body.email, password: body.password, organization: body.organization })
    const session = await createSession(user.id)
    return withSessionCookie(
      NextResponse.json(publicUser(user), { status: 201 }),
      session.token,
      request,
    )
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
