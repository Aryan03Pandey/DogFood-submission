import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'

import { AuthError, getSessionUser } from '@/src/server/auth-service'
import { getEventBySlug, serializeEvent } from '@/src/server/event-service'
import { VotingBoothPage } from '@/components/event-page/voting-booth-page'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params
  return { title: `Vote | ${slug}` }
}

// Dedicated voting page: reachable from the "Vote for this Event" button
// while public voting is open. Any other phase 404s here; results live on
// the event page voting tab instead.
export default async function EventVotePage({ params }: Params) {
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
  if (event.status !== 'PUBLIC_VOTING') notFound()

  // Host-reachable filer base for asset embeds; the browser cannot resolve
  // the in-compose hostname (same construction as the judge dashboard).
  const filerBase = (process.env.SEAWEEDFS_FILER_URL ?? 'http://localhost:8888').replace(/\/$/, '')
  const bucket = process.env.S3_BUCKET ?? 'dogfood-assets'

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <VotingBoothPage
        eventId={event.id}
        eventSlug={event.slug}
        eventTitle={event.title}
        assetBase={filerBase}
        bucket={bucket}
      />
    </main>
  )
}
