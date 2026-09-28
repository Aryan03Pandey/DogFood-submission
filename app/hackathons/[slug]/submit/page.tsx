import { cookies } from 'next/headers'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { AuthError, getEventRole, getSessionUser } from '@/src/server/auth-service'
import { getEventBySlug, listTracks, serializeEvent, serializeTrack } from '@/src/server/event-service'
import { getMySubmission } from '@/src/server/submission-service'
import { getPrizeAwardForSubmission } from '@/src/server/certificate-service'
import { SubmissionForm } from '@/components/submission/submission-form'

interface Params {
  params: Promise<{ slug: string }>
}

// Project submission per SUBMISSIONS.md: registered participants get a bare
// draft (track picked in the form, saved via Save draft); the leader finalizes.
// Staff and strangers get an honest note, never the form.
export default async function EventSubmitPage({ params }: Params) {
  const { slug } = await params
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  const session = await getSessionUser(token)
  if (!session) redirect('/login')
  const viewer = session.user

  let event
  try {
    event = serializeEvent(await getEventBySlug(slug, viewer))
  } catch (error) {
    if (error instanceof AuthError) notFound()
    throw error
  }
  if (event.status === 'DRAFT') notFound()

  const back = (
    <Link
      href={`/hackathons/${slug}`}
      className="mt-6 inline-flex h-10 items-center rounded-lg border border-border px-5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
    >
      Back to event
    </Link>
  )

  const mapping = await getEventRole(viewer.id, event.id)
  if (mapping !== 'PARTICIPANT' && viewer.role !== 'SUPERADMIN') {
    const staff = mapping === 'ORGANIZER' || mapping === 'JUDGE'
    return (
      <main className="mx-auto w-full max-w-5xl px-5 py-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{event.title}</p>
        <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-foreground">Make a submission</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {staff
            ? 'You staff this event — submissions live in the console dashboard.'
            : 'Register for this event first, then come back to submit your project.'}
        </p>
        {back}
      </main>
    )
  }

  const [trackRows, summary] = await Promise.all([
    listTracks(event.id, viewer).then((rows) => rows.map(serializeTrack)),
    getMySubmission(viewer, event.id).catch(() => null),
  ])
  // serializeEvent already derives the effective status from the server clock.
  const submissionsOpen = event.status === 'SUBMISSION'
  const prizeAward =
    summary?.status === 'final' ? await getPrizeAwardForSubmission(summary.id).catch(() => null) : null

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{event.title}</p>
      <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-foreground">Make a submission</h1>
      {summary?.status === 'final' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`/api/events/${event.id}/certificates/participant/${summary.id}`}
            download
            className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-[12px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            Download certificate
          </a>
          {prizeAward && (
            <a
              href={`/api/events/${event.id}/certificates/winner/${prizeAward.id}`}
              download
              className="inline-flex h-9 items-center rounded-lg bg-[#16a34a] px-4 text-[12px] font-bold text-white transition-colors hover:bg-[#15803d]"
            >
              Download winner certificate — {prizeAward.prizeTitle}
            </a>
          )}
        </div>
      )}
      <div className="mt-6">
        <SubmissionForm
          eventId={event.id}
          slug={slug}
          tracks={trackRows.map((track) => ({
            id: track.id,
            name: track.name,
            description: track.description,
          }))}
          initial={summary}
          submissionsOpen={submissionsOpen}
        />
      </div>
    </main>
  )
}
