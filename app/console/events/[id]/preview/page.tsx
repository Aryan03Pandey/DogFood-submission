import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { AuthError, getEffectiveRole, getSessionUser, hasConsoleAccess } from '@/src/server/auth-service'
import { getEvent, listPrizes, listTracks, serializeEvent, serializePrize, serializeTrack } from '@/src/server/event-service'
import { GoLiveControl } from '@/components/console/dashboard/go-live-control'
import { PreviewShell } from '@/components/console/preview-shell'
import { formatSubmittedDate } from '@/src/lib/gallery'
import type { WizardData } from '@/src/lib/event-creation'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

// Final preview screen for a saved draft (EVENT-CREATION.md): the same
// EventPreview component as the wizard side pane, framed at switchable
// device widths. Organizers and superadmins only.
export default async function EventPreviewPage({ params }: Params) {
  const { id: eventId } = await params
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  const session = await getSessionUser(token)
  if (!session) redirect('/login')
  if (!(await hasConsoleAccess(session.user))) redirect('/my-hackathons')

  const role = await getEffectiveRole(session.user, eventId)
  if (role !== 'SUPERADMIN' && role !== 'ORGANIZER') redirect('/console')

  let event
  try {
    event = serializeEvent(await getEvent(eventId, session.user))
  } catch (error) {
    if (error instanceof AuthError) notFound()
    throw error
  }
  const tracks = (await listTracks(eventId, session.user)).map(serializeTrack)
  const prizes = (await listPrizes(eventId, session.user)).map(serializePrize)

  const trackNames: Record<string, string> = {}
  for (const track of tracks) trackNames[track.id] = track.name

  const data: WizardData = {
    eventId: event.id,
    slug: event.slug,
    title: event.title,
    logoUrl: event.logoUrl,
    bannerUrl: event.bannerUrl,
    cardBannerUrl: event.cardBannerUrl,
    websiteUrl: event.websiteUrl ?? '',
    format: event.format,
    locationName: event.locationName ?? '',
    locationAddress: event.locationAddress ?? '',
    mapsUrl: event.mapsUrl ?? '',
    descriptionHtml: event.descriptionHtml ?? '',
    registrationEnd: event.registrationEnd,
    submissionStart: event.submissionStart,
    submissionDeadline: event.submissionDeadline,
    judgingStart: event.judgingStart,
    judgingEndTime: event.judgingEndTime,
    votingEnabled: event.publicVotingStart != null || event.publicVotingEndTime != null,
    publicVotingStart: event.publicVotingStart,
    publicVotingEndTime: event.publicVotingEndTime,
    announcementDate: event.announcementDate,
    participationType: event.participationType,
    minTeamSize: event.minTeamSize,
    maxTeamSize: event.maxTeamSize,
    audience: event.audience,
    tracks: tracks.map((track) => ({
      key: track.id,
      id: track.id,
      name: track.name,
      description: track.description ?? '',
    })),
    tiers: prizes.map((prize) => ({
      key: prize.id,
      id: prize.id,
      title: prize.title,
      kind: prize.kind,
      amount: String(prize.cashValue),
      currency: prize.currency,
      trackId: prize.trackId ?? '',
    })),
    participationCertificate: event.participationCertificate,
    acknowledged: true,
  }

  const dateRange =
    event.registrationEnd && event.submissionDeadline
      ? `${formatSubmittedDate(event.registrationEnd)} – ${formatSubmittedDate(event.submissionDeadline)}`
      : null

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        Preview · {event.title} · {event.status.toLowerCase().replace('_', ' ')}
      </p>
      <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-foreground">
        Event preview
      </h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        Everything below ships to the public page: description, team eligibility, tracks, prizes,
        and schedule. Still a draft — nothing is public.
      </p>
      <div className="mt-4">
        <GoLiveControl eventId={event.id} isDraft={event.status === 'DRAFT'} />
      </div>
      <div className="mt-6">
        <PreviewShell data={data} trackNames={trackNames} dateRange={dateRange} />
      </div>
    </main>
  )
}
