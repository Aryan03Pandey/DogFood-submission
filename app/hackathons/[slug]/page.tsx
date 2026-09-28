import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'

import { Calendar, Globe, MapPin, Users, Vote } from 'lucide-react'
import { AuthError, getEventRole, getSessionUser } from '@/src/server/auth-service'
import {
  countEventRegistrations,
  getEventBySlug,
  listPrizes,
  listTracks,
  serializeEvent,
  serializePrize,
  serializeTrack,
} from '@/src/server/event-service'
import { getMyTeam } from '@/src/server/team-service'
import { formatSubmittedDate } from '@/src/lib/gallery'
import { getEventActionState, withEventSlug, type EventMembership } from '@/src/lib/event-access'
import { EventAction } from '@/components/event-page/event-action'
import { EventTabs } from '@/components/event-page/event-tabs'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params
  return { title: `Event | ${slug}` }
}

function formatLabel(value: string): string {
  return value === 'ONLINE' ? 'Online' : value === 'OFFLINE' ? 'In person' : 'Hybrid'
}

function audienceLabel(value: string): string {
  return value === 'OPEN' ? 'Open to all' : value === 'STUDENT' ? 'Students' : 'Professionals'
}

function kindLabel(kind: string): string {
  return kind === 'MONETARY' ? 'Cash' : kind === 'IN_KIND' ? 'In-kind' : 'Certificate'
}

// Public event page: everything a visitor needs — header summary, the
// action button with its phase- and membership-dependent states, and
// Description / Timeline / Tracks / Prizes tabs. Drafts 404 here; the
// console preview covers those.
export default async function EventPage({ params }: Params) {
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
  if (event.status === 'DRAFT') notFound()

  const [trackRows, prizeRows, registrationCount] = await Promise.all([
    listTracks(event.id, viewer).then((rows) => rows.map(serializeTrack)),
    listPrizes(event.id, viewer).then((rows) => rows.map(serializePrize)),
    countEventRegistrations(event.id),
  ])

  const trackNames: Record<string, string> = {}
  for (const track of trackRows) trackNames[track.id] = track.name

  let membership: EventMembership = 'anonymous'
  if (viewer) {
    if (viewer.role === 'SUPERADMIN') {
      membership = 'staff'
    } else {
      const mapping = await getEventRole(viewer.id, event.id)
      membership = mapping === 'PARTICIPANT' ? 'participant' : mapping === null ? 'unmapped' : 'staff'
    }
  }

  const now = new Date()
  const myTeam =
    membership === 'participant' && event.participationType === 'TEAM'
      ? await getMyTeam(viewer!, event.id)
      : null
  const action = withEventSlug(
    getEventActionState({
      status: event.status as 'REGISTRATION' | 'SUBMISSION' | 'JUDGING' | 'PUBLIC_VOTING' | 'PUBLISHED' | 'DRAFT',
      membership,
      now,
      submissionStart: event.submissionStart,
      registrationEnd: event.registrationEnd,
      registrationCount,
      participation: event.participationType,
      team: myTeam
        ? { size: myTeam.members.length, min: myTeam.minTeamSize, max: myTeam.maxTeamSize }
        : null,
    }),
    event.slug,
  )

  const timeline = [
    { label: 'Registration ends', date: event.registrationEnd ? formatSubmittedDate(event.registrationEnd) : 'TBA', current: event.status === 'REGISTRATION' },
    { label: 'Submissions due', date: event.submissionDeadline ? formatSubmittedDate(event.submissionDeadline) : 'TBA', current: event.status === 'SUBMISSION' },
    { label: 'Judging', date: event.judgingStart ? formatSubmittedDate(event.judgingStart) : event.judgingEndTime ? formatSubmittedDate(event.judgingEndTime) : 'TBA', current: event.status === 'JUDGING' },
    { label: 'Public voting', date: event.publicVotingStart ? formatSubmittedDate(event.publicVotingStart) : 'TBA', current: event.status === 'PUBLIC_VOTING' },
    { label: 'Winners announced', date: event.announcementDate ? formatSubmittedDate(event.announcementDate) : 'TBA', current: event.status === 'PUBLISHED' },
  ]

  const dateRange =
    event.registrationEnd && event.submissionDeadline
      ? `${formatSubmittedDate(event.registrationEnd)} – ${formatSubmittedDate(event.submissionDeadline)}`
      : null
  const showLocation = event.format !== 'ONLINE'

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12">
      <article className="overflow-hidden rounded-xl border border-border bg-card">
        {event.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.bannerUrl} alt="" className="max-h-64 w-full object-cover" />
        ) : (
          <div className="flex h-32 items-center justify-center bg-muted" aria-hidden="true">
            <p className="text-[11px] font-semibold text-muted-foreground">Banner preview</p>
          </div>
        )}
        <div className="p-6">
          <div className="flex items-center gap-3">
            {event.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.logoUrl}
                alt=""
                className="size-14 shrink-0 rounded-xl border border-border object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-[#16a34a] text-[20px] font-bold text-white"
              >
                {(event.title.trim().charAt(0) || 'H').toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-bold tracking-[-0.02em] text-foreground">
                {event.title}
              </h1>
              {event.websiteUrl && (
                <a
                  href={event.websiteUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#16a34a] hover:underline dark:text-[#22c55e]"
                >
                  <Globe size={13} strokeWidth={1.8} aria-hidden="true" />
                  {event.websiteUrl.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
            <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] font-semibold capitalize text-muted-foreground">
              {event.status.toLowerCase().replace('_', ' ')}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              {formatLabel(event.format)}
            </span>
            <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              {audienceLabel(event.audience)}
            </span>
            <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              {event.participationType === 'TEAM'
                ? `Teams of ${event.minTeamSize}–${event.maxTeamSize}`
                : 'Individual'}
            </span>
          </div>

          <ul className="mt-4 flex flex-col gap-2 text-[13px] text-muted-foreground">
            {dateRange && (
              <li className="flex items-center gap-2">
                <Calendar size={14} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
                {dateRange}
              </li>
            )}
            {showLocation && event.locationName && (
              <li className="flex items-center gap-2">
                <MapPin size={14} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
                {event.locationName}
                {event.locationAddress && ` · ${event.locationAddress}`}
              </li>
            )}
            <li className="flex items-center gap-2">
              <Users size={14} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
              {event.participationType === 'TEAM'
                ? `Team participation (${event.minTeamSize}–${event.maxTeamSize} members)`
                : 'Individual participation'}
            </li>
          </ul>
        </div>
      </article>

      <div className="mt-4">
        <EventAction
          eventId={event.id}
          slug={event.slug}
          state={action}
          deadlineLabel={event.registrationEnd ? formatSubmittedDate(event.registrationEnd) : null}
          registrationCount={registrationCount}
        />
      </div>

      {event.status === 'PUBLIC_VOTING' && (
        <div className="mt-4">
          <a
            href={`/hackathons/${event.slug}/vote`}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d]"
          >
            <Vote size={14} strokeWidth={1.8} aria-hidden="true" />
            Vote for this Event
          </a>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-border bg-card px-6 pt-2">
        <EventTabs
          descriptionHtml={event.descriptionHtml}
          timeline={timeline}
          tracks={trackRows.map((track) => ({ id: track.id, name: track.name, description: track.description }))}
          prizes={prizeRows.map((prize) => ({
            id: prize.id,
            title: prize.title,
            kind: kindLabel(prize.kind),
            amount: String(prize.cashValue),
            currency: prize.currency,
            trackName: prize.trackId ? (trackNames[prize.trackId] ?? null) : null,
          }))}
          participationCertificate={event.participationCertificate}
        />
      </div>
    </main>
  )
}
