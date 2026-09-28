import { cookies } from 'next/headers'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { AuthError, getEventRole, getSessionUser } from '@/src/server/auth-service'
import { getEventBySlug, serializeEvent } from '@/src/server/event-service'
import { getMyTeam } from '@/src/server/team-service'
import { ManageTeam } from '@/components/team/manage-team'
import { TeamForms } from '@/components/team/team-forms'
import { IndividualView } from '@/components/team/individual-view'

interface Params {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ mode?: string }>
}

// Manage-team home per TEAM-FORMATION.md. Teamless users pick Create vs
// Join; members manage the roster; INDIVIDUAL registrants see their
// solo view. Staff get a pointer to the console instead of a roster.
export default async function EventTeamPage({ params, searchParams }: Params) {
  const { slug } = await params
  const { mode } = await searchParams
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

  if (viewer.role === 'SUPERADMIN') {
    return (
      <main className="mx-auto w-full max-w-5xl px-5 py-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{event.title}</p>
        <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-foreground">Manage team</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          You staff this event — rosters live in the console dashboard.
        </p>
        {back}
      </main>
    )
  }

  const mapping = await getEventRole(viewer.id, event.id)
  if (mapping !== 'PARTICIPANT') {
    const staff = mapping === 'ORGANIZER' || mapping === 'JUDGE'
    return (
      <main className="mx-auto w-full max-w-5xl px-5 py-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{event.title}</p>
        <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-foreground">Manage team</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {staff
            ? 'You staff this event — rosters live in the console dashboard.'
            : 'Register for this event first, then come back to manage your team.'}
        </p>
        {back}
      </main>
    )
  }

  if (event.participationType === 'INDIVIDUAL') {
    return (
      <main className="mx-auto w-full max-w-5xl px-5 py-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{event.title}</p>
        <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-foreground">Manage team</h1>
        <div className="mt-6">
          <IndividualView
            eventId={event.id}
            slug={slug}
            name={viewer.name}
            email={viewer.email}
          />
        </div>
        {back}
      </main>
    )
  }

  const summary = await getMyTeam(viewer, event.id)
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{event.title}</p>
      <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-foreground">Manage team</h1>
      <div className="mt-6">
        {summary ? (
          <ManageTeam eventId={event.id} slug={slug} initial={summary} />
        ) : (
          <TeamForms
            eventId={event.id}
            slug={slug}
            initialMode={mode === 'join' ? 'join' : 'create'}
          />
        )}
      </div>
      {back}
    </main>
  )
}
