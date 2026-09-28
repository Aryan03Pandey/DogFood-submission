import { NextResponse } from 'next/server'
import { getVotingState } from '@/src/server/voting-service'
import { checkRateLimit, generateVoterFingerprint, getClientIp } from '@/src/server/anti-abuse-service'
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
    // Server-side backstop for the leaderboard Refresh button (which also
    // enforces its own 15s client cooldown). Generous: normal browsing and
    // the booth's post-toggle state refresh stay far below it.
    checkRateLimit(`leaderboard:${getClientIp(request)}`, 100, 60_000)
    const session = await getSessionUser(await getRequestToken())
    const fingerprint = generateVoterFingerprint(request, session?.user.id)
    const state = await getVotingState(session?.user ?? null, eventId, fingerprint)

    return NextResponse.json(state)
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}