import { Calendar, Globe, MapPin, Users } from 'lucide-react'

import { EventTabs } from '@/components/event-page/event-tabs'
import { formatSubmittedDate } from '@/src/lib/gallery'
import type { PrizeTierInput, WizardData } from '@/src/lib/event-creation'

function formatLabel(value: WizardData['format']): string {
  return value === 'ONLINE' ? 'Online' : value === 'OFFLINE' ? 'In person' : 'Hybrid'
}

function audienceLabel(value: WizardData['audience']): string {
  return value === 'OPEN' ? 'Open to all' : value === 'STUDENT' ? 'Students' : 'Professionals'
}

function kindLabel(kind: PrizeTierInput['kind']): string {
  return kind === 'MONETARY' ? 'Cash' : kind === 'IN_KIND' ? 'In-kind' : 'Certificate'
}

// Header plus the public event tabs, shared by the wizard side pane and
// the preview screen: the tabs below are the exact component the public
// event page renders, so the preview cannot drift from the real page.
// Purely presentational: callers pass wizard state (live draft).
export function EventPreview({
  data,
  trackNames = {},
  dateRange,
}: {
  data: WizardData
  trackNames?: Record<string, string>
  dateRange: string | null
}) {
  const showLocation = data.format !== 'ONLINE'
  // Same five rows as the public event page; nothing is "current" in a
  // preview because the draft has no phase yet.
  const timeline = [
    { label: 'Registration ends', date: data.registrationEnd ? formatSubmittedDate(data.registrationEnd) : 'TBA', current: false },
    { label: 'Submissions due', date: data.submissionDeadline ? formatSubmittedDate(data.submissionDeadline) : 'TBA', current: false },
    { label: 'Judging', date: data.judgingStart ? formatSubmittedDate(data.judgingStart) : data.judgingEndTime ? formatSubmittedDate(data.judgingEndTime) : 'TBA', current: false },
    { label: 'Public voting', date: data.publicVotingStart ? formatSubmittedDate(data.publicVotingStart) : 'TBA', current: false },
    { label: 'Winners announced', date: data.announcementDate ? formatSubmittedDate(data.announcementDate) : 'TBA', current: false },
  ]
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      {data.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.bannerUrl} alt="" className="max-h-64 w-full object-cover" />
      ) : (
        <div className="flex h-32 items-center justify-center bg-muted" aria-hidden="true">
          <p className="text-[11px] font-semibold text-muted-foreground">Banner preview</p>
        </div>
      )}
      <div className="p-6">
        <div className="flex items-center gap-3">
          {data.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.logoUrl}
              alt=""
              className="size-14 shrink-0 rounded-xl border border-border object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-[#16a34a] text-[20px] font-bold text-white"
            >
              {(data.title.trim().charAt(0) || 'H').toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-[22px] font-bold tracking-[-0.02em] text-foreground">
              {data.title.trim() === '' ? 'Untitled event' : data.title}
            </h2>
            {data.websiteUrl.trim() !== '' && (
              <a
                href={data.websiteUrl.trim()}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#16a34a] dark:text-[#22c55e]"
              >
                <Globe size={13} strokeWidth={1.8} aria-hidden="true" />
                {data.websiteUrl.trim().replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
            {formatLabel(data.format)}
          </span>
          <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
            {audienceLabel(data.audience)}
          </span>
          <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
            {data.participationType === 'TEAM'
              ? `Teams of ${data.minTeamSize}–${data.maxTeamSize}`
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
          {showLocation && data.locationName.trim() !== '' && (
            <li className="flex items-center gap-2">
              <MapPin size={14} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
              {data.locationName}
              {data.locationAddress.trim() !== '' && ` · ${data.locationAddress}`}
            </li>
          )}
          <li className="flex items-center gap-2">
            <Users size={14} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
            {data.participationType === 'TEAM'
              ? `Team participation (${data.minTeamSize}–${data.maxTeamSize} members)`
              : 'Individual participation'}
          </li>
        </ul>

        <div className="mt-4 border-t border-border pt-2">
          <EventTabs
            descriptionHtml={data.descriptionHtml}
            timeline={timeline}
            tracks={data.tracks.map((track) => ({
              id: track.key,
              name: track.name.trim() === '' ? 'Untitled track' : track.name,
              description: track.description.trim() === '' ? null : track.description,
            }))}
            prizes={data.tiers.map((tier) => ({
              id: tier.key,
              title: tier.title.trim() === '' ? 'Untitled prize' : tier.title,
              kind: kindLabel(tier.kind),
              amount: tier.amount,
              currency: tier.currency,
              trackName: tier.trackId !== '' && trackNames[tier.trackId] ? trackNames[tier.trackId] : null,
            }))}
            participationCertificate={data.participationCertificate}
          />
        </div>
      </div>
    </article>
  )
}
