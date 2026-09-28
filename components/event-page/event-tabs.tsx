'use client'

import { useState } from 'react'
import { Calendar, Trophy } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ExpandableHtml } from '@/components/console/expandable-html'

export interface EventTimelineEntry {
  label: string
  date: string
  current: boolean
}

export interface EventTrackEntry {
  id: string
  name: string
  description: string | null
}

export interface EventPrizeEntry {
  id: string
  title: string
  kind: string
  amount: string
  currency: string
  trackName: string | null
}

export type EventTabId = 'description' | 'timeline' | 'tracks' | 'prizes'

// Public event tabs: description, timeline, tracks (only when the event has
// any), and prizes. Community upvotes live on the dedicated /vote page
// (reached via the "Vote for this Event" button), not in a tab. Tab buttons
// are real controls switching local state.
export function EventTabs({
  descriptionHtml,
  timeline,
  tracks,
  prizes,
  participationCertificate,
}: {
  descriptionHtml: string | null
  timeline: EventTimelineEntry[]
  tracks: EventTrackEntry[]
  prizes: EventPrizeEntry[]
  participationCertificate: boolean
}) {
  const tabs: Array<{ id: EventTabId; label: string }> = [
    { id: 'description', label: 'Description' },
    { id: 'timeline', label: 'Timeline' },
    ...(tracks.length > 0 ? [{ id: 'tracks' as const, label: 'Tracks' }] : []),
    { id: 'prizes', label: 'Prizes' },
  ]
  const [active, setActive] = useState<EventTabId>('description')

  return (
    <div>
      <div role="tablist" aria-label="Event details" className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              'shrink-0 border-b-2 px-4 py-2.5 text-[13px] font-bold transition-colors',
              active === tab.id
                ? 'border-[#16a34a] text-[#16a34a] dark:text-[#22c55e]'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="py-6">
        {active === 'description' && (
          descriptionHtml && descriptionHtml.trim() !== '' ? (
            <ExpandableHtml html={descriptionHtml} />
          ) : (
            <p className="text-[13px] text-muted-foreground">The organizers have not added a description yet.</p>
          )
        )}

        {active === 'timeline' && (
          <ol className="flex flex-col gap-2">
            {timeline.map((entry) => (
              <li
                key={entry.label}
                aria-current={entry.current ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2 text-[13px] font-semibold',
                  entry.current
                    ? 'border-[#16a34a]/40 bg-[#16a34a]/5 text-foreground'
                    : 'border-border text-muted-foreground',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    entry.current ? 'bg-[#16a34a] dark:bg-[#22c55e]' : 'bg-border',
                  )}
                />
                {entry.label}
                <span className="ml-auto text-[12px] font-medium">{entry.date}</span>
                {entry.current && (
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[#16a34a] dark:text-[#22c55e]">
                    Current
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}

        {active === 'tracks' && (
          <ul className="flex flex-col gap-2">
            {tracks.map((track) => (
              <li key={track.id} className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-[14px] font-bold text-foreground">{track.name}</p>
                {track.description && (
                  <p className="mt-1 text-[13px] text-muted-foreground">{track.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {active === 'prizes' && (
          <div className="flex flex-col gap-2">
            {prizes.length === 0 && (
              <p className="text-[13px] text-muted-foreground">Prizes will be announced soon.</p>
            )}
            {prizes.map((prize) => (
              <div
                key={prize.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-[14px] font-bold text-foreground">
                    <Trophy size={15} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-muted-foreground" />
                    <span className="truncate">{prize.title}</span>
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    {prize.kind}
                    {prize.trackName ? ` · ${prize.trackName}` : ''}
                  </span>
                </span>
                {prize.kind !== 'Certificate' && prize.amount !== '' && (
                  <span className="shrink-0 text-[14px] font-bold text-foreground">
                    {prize.currency !== '' ? `${prize.currency} ` : ''}
                    {Number.parseInt(prize.amount, 10).toLocaleString('en-US')}
                  </span>
                )}
              </div>
            ))}
            {participationCertificate && (
              <p className="text-[12px] font-semibold text-[#16a34a] dark:text-[#22c55e]">
                Participation certificates for all hackers.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
