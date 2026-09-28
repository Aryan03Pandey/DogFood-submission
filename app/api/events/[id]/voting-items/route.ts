import { NextResponse } from 'next/server'
import { getVotingItemsShuffled } from '@/src/server/voting-service'
import { generateVoterFingerprint } from '@/src/server/anti-abuse-service'
import { getSessionUser } from '@/src/server/auth-service'
import {
  authErrorResponse,
  getRequestToken,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id: eventId } = await params
    const url = new URL(request.url)
    const session = await getSessionUser(await getRequestToken())
    const defaultSeed = generateVoterFingerprint(request, session?.user.id)
    const seed = url.searchParams.get('seed') ?? defaultSeed

    const items = await getVotingItemsShuffled(eventId, seed)
    return NextResponse.json({ seed, items })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}