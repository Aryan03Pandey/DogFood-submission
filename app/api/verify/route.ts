import { NextResponse } from 'next/server'
import { verifyEnvelope } from '@/src/server/signing-service'
import { authErrorResponse, routeContext } from '@/src/server/http'

// Public: verifies an arbitrary posted envelope against the key registry.
// Envelope shape is validated inside verifyEnvelope itself (it must accept
// malformed input gracefully rather than 400ing, since "not a valid envelope"
// is itself a meaningful, non-error verification result).
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const result = await verifyEnvelope(body)
    return NextResponse.json(result)
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
