import { NextResponse } from 'next/server'
import { revokeSession } from '@/src/server/auth-service'
import { authErrorResponse, getRequestToken, routeContext, withClearedSession } from '@/src/server/http'

export async function POST(request: Request) {
  try {
    await revokeSession(await getRequestToken())
    return withClearedSession(NextResponse.json({ ok: true }))
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
