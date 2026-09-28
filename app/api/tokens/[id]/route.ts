import { NextResponse } from 'next/server'
import { revokeToken } from '@/src/server/token-service'
import { authErrorResponse, jsonError, requireSession, routeContext } from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id } = await params
    const revoked = await revokeToken(session.user.id, id)
    if (!revoked) return jsonError('TOKEN_NOT_FOUND', 404)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
