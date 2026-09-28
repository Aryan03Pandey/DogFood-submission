'use client'

import { useState } from 'react'

import { cn } from '@/lib/utils'
import EventForm from '@/components/console/event-form'
import TrackManager from '@/components/console/track-manager'
import PrizeManager from '@/components/console/prize-manager'
import type { EventPayload, PrizePayload, TrackPayload } from '@/lib/api-client'

const TABS = [
  { id: 'settings', label: 'Settings' },
  { id: 'tracks', label: 'Tracks' },
  { id: 'prizes', label: 'Prizes' },
] as const

type TabId = (typeof TABS)[number]['id']

// Tab shell for the organizer event detail page. Data arrives from the
// server; each panel manages its own mutations against the event APIs.
export default function EventTabs({
  event,
  tracks,
  prizes,
  locked,
}: {
  event: EventPayload
  tracks: TrackPayload[]
  prizes: PrizePayload[]
  locked: boolean
}) {
  const [tab, setTab] = useState<TabId>('settings')

  return (
    <div className="mt-6">
      <div role="tablist" aria-label="Event sections" className="flex w-fit gap-1 rounded-lg bg-muted p-1">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={cn(
              'inline-flex h-9 items-center rounded-lg px-4 text-[13px] font-bold transition-colors',
              tab === entry.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === 'settings' && <EventForm mode="edit" event={event} locked={locked} />}
        {tab === 'tracks' && (
          <TrackManager eventId={event.id} initialTracks={tracks} locked={locked} />
        )}
        {tab === 'prizes' && (
          <PrizeManager eventId={event.id} tracks={tracks} initialPrizes={prizes} locked={locked} />
        )}
      </div>
    </div>
  )
}
