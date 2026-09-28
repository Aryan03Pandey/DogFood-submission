'use client'

import { useState } from 'react'

import { cn } from '@/lib/utils'
import EventCard from '@/components/event-card'
import { HACKATHON_TABS, type HackathonEvent, type HackathonTab } from '@/src/lib/hackathons'

// Tabbed event listing. Cards link to the event page — there is deliberately
// no apply button here or on the homepage; the event page owns registration.
// Event pages do not exist yet, so card links 404 until built.
export default function HackathonTabs({ events }: { events: HackathonEvent[] }) {
  const [tab, setTab] = useState<HackathonTab>('live')
  const visible = events.filter((event) => event.tab === tab)
  const activeTab = HACKATHON_TABS.find((entry) => entry.id === tab)!

  return (
    <div className="mt-6">
      <div
        role="tablist"
        aria-label="Filter hackathons"
        className="sticky top-16 z-10 flex w-fit gap-1 rounded-lg bg-muted p-1"
      >
        {HACKATHON_TABS.map((entry) => {
          const count = events.filter((event) => event.tab === entry.id).length
          const active = entry.id === tab
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(entry.id)}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-bold transition-colors',
                active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {entry.label}
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  active ? 'bg-muted text-muted-foreground' : 'bg-background text-muted-foreground',
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <div className="mt-4 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-[14px] font-bold text-foreground">No {activeTab.label.toLowerCase()} hackathons right now.</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Check another tab or come back later.</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {visible.map((event) => (
            <EventCard key={event.id} event={event} heading="h2" />
          ))}
        </div>
      )}
    </div>
  )
}
