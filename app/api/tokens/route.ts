import { NextResponse } from 'next/server'
import { createTokenRequestSchema } from '@/src/lib/api/schemas'
import { createToken, listTokens } from '@/src/server/token-service'
import { authErrorResponse, parseBody, requireSession, routeContext } from '@/src/server/http'

export async function POST(request: Request) {
  try {
    const session = await requireSession()
    const body = await parseBody(request, createTokenRequestSchema)
    const issued = await createToken(session.user.id, body.name)
    return NextResponse.json(
      { id: issued.id, name: issued.name, token: issued.token, createdAt: issued.createdAt.toISOString() },
      { status: 201 },
    )
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

// Never returns tokenHash — name, prefix, and dates only.
export async function GET(request: Request) {
  try {
    const session = await requireSession()
    const rows = await listTokens(session.user.id)
    return NextResponse.json({
      tokens: rows.map((row) => ({
        id: row.id,
        name: row.name,
        tokenPrefix: row.tokenPrefix,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
        revokedAt: row.revokedAt?.toISOString() ?? null,
      })),
    })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
