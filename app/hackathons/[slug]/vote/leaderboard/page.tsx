import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'

import { AuthError, getSessionUser } from '@/src/server/auth-service'
import { getEventBySlug, serializeEvent } from '@/src/server/event-service'
import { VotingLeaderboard } from '@/components/event-page/voting-leaderboard'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params
  return { title: `Leaderboard | ${slug}` }
}

// Public leaderboard screen: linked from the voting booth. Visible while
// voting is open and after it closes (blind events mask the tally via the
// same rule as the booth).
export default async function EventLeaderboardPage({ params }: Params) {
  const { slug } = await params
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  const session = await getSessionUser(token)
  const viewer = session?.user ?? null

  let event
  try {
    event = serializeEvent(await getEventBySlug(slug, viewer))
  } catch (error) {
    if (error instanceof AuthError) notFound()
    throw error
  }
  if (event.status !== 'PUBLIC_VOTING' && event.status !== 'PUBLISHED') notFound()

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <VotingLeaderboard
        eventId={event.id}
        eventTitle={event.title}
        backHref={`/hackathons/${event.slug}/vote`}
        backLabel="Back to voting"
      />
    </main>
  )
}
