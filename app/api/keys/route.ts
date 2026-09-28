import { NextResponse } from 'next/server'
import { listPublicKeys } from '@/src/server/crypto/keys'
import { authErrorResponse, routeContext } from '@/src/server/http'

// Public JWKS-like listing: anyone verifying a signed export/manifest offline
// needs this to resolve a kid to a public key, with no session required.
export async function GET(request: Request) {
  try {
    const keys = await listPublicKeys()
    return NextResponse.json({
      keys: keys.map((key) => ({
        kid: key.kid,
        publicKeyPem: key.publicKeyPem,
        createdAt: key.createdAt.toISOString(),
        retiredAt: key.retiredAt?.toISOString() ?? null,
        status: key.retiredAt ? 'retired' : 'active',
      })),
    })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
