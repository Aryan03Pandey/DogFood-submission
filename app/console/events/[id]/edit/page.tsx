import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { AuthError, getEffectiveRole, getSessionUser, hasConsoleAccess } from '@/src/server/auth-service'
import {
  getEventRow,
  listPrizes,
  listTracks,
  serializePrize,
  serializeTrack,
} from '@/src/server/event-service'
import { deriveEventStatus } from '@/src/db/schema'
import { wizardFromEvent } from '@/src/lib/event-creation'
import { EventWizard } from '@/components/console/event-wizard'

interface Params {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Edit Event | Dogfood 2026',
  description: 'Edit a draft hackathon event, step by step.',
}

// Edit entry (EVENT-CREATION.md): the creation wizard in edit mode with
// every attribute pre-filled. Live events stay editable for the editable
// subset only (description, location, format, media, future dates) — titles,
// rules, tracks, and prizes freeze at go-live, enforced in the UI and the
// APIs alike.
export default async function EditEventPage({ params }: Params) {
  const { id: eventId } = await params
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  const session = await getSessionUser(token)
  if (!session) redirect('/login')
  if (!(await hasConsoleAccess(session.user))) redirect('/my-hackathons')
  const viewer = session.user

  let row
  try {
    row = await getEventRow(eventId)
  } catch (error) {
    if (error instanceof AuthError) {
      return (
        <main className="mx-auto w-full max-w-[1440px] px-5 py-12">
          <h1 className="text-[28px] font-bold tracking-[-0.03em] text-foreground">Edit Event</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">That event does not exist.</p>
        </main>
      )
    }
    throw error
  }

  const effective = await getEffectiveRole(viewer, eventId)
  if (effective !== 'SUPERADMIN' && effective !== 'ORGANIZER') {
    return (
      <main className="mx-auto w-full max-w-[1440px] px-5 py-12">
        <h1 className="text-[28px] font-bold tracking-[-0.03em] text-foreground">Edit Event</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Only organizers of this event can edit it.
        </p>
      </main>
    )
  }

  const live = deriveEventStatus(row) !== 'DRAFT'

  const [trackRows, prizeRows] = await Promise.all([
    listTracks(eventId, viewer),
    listPrizes(eventId, viewer),
  ])
  const initial = wizardFromEvent({
    event: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      logoUrl: row.logoUrl,
      bannerUrl: row.bannerUrl,
      cardBannerUrl: row.cardBannerUrl,
      websiteUrl: row.websiteUrl,
      format: row.format,
      locationName: row.locationName,
      locationAddress: row.locationAddress,
      mapsUrl: row.mapsUrl,
      descriptionHtml: row.descriptionHtml,
      registrationEnd: row.registrationEnd?.toISOString() ?? null,
      submissionStart: row.submissionStart?.toISOString() ?? null,
      submissionDeadline: row.submissionDeadline?.toISOString() ?? null,
      judgingStart: row.judgingStart?.toISOString() ?? null,
      judgingEndTime: row.judgingEndTime?.toISOString() ?? null,
      publicVotingStart: row.publicVotingStart?.toISOString() ?? null,
      publicVotingEndTime: row.publicVotingEndTime?.toISOString() ?? null,
      announcementDate: row.announcementDate?.toISOString() ?? null,
      participationType: row.participationType,
      minTeamSize: row.minTeamSize,
      maxTeamSize: row.maxTeamSize,
      audience: row.audience,
      participationCertificate: row.participationCertificate,
    },
    tracks: trackRows.map((track) => ({ id: track.id, name: track.name, description: track.description })),
    prizes: prizeRows.map((prize) => ({ ...serializePrize(prize) })),
  })
  // Live events skip the prize re-ack: the checkbox is frozen and the lock
  // it describes is already in effect.
  if (live) initial.acknowledged = true

  return (
    <main className="mx-auto w-full max-w-[1440px] px-5 py-12">
      <h1 className="text-[28px] font-bold tracking-[-0.03em] text-foreground">Edit Event</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        {live
          ? 'This event is live: titles, rules, tracks, and prizes are frozen — description, location, format, website, media, and future dates can still change.'
          : 'Every attribute is pre-filled. Saving re-runs all date, track, and prize checks.'}
      </p>
      <div className="mt-6">
        <EventWizard
          tracks={trackRows.map(serializeTrack)}
          mode="edit"
          initial={initial}
          live={live}
        />
      </div>
    </main>
  )
}
