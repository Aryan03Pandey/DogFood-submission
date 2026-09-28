'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, ChevronsUpDown, Search } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { DashboardTabId } from '@/components/console/dashboard/tabs'

// Event switcher (top dock middle): searchable dropdown of every event the
// viewer may manage. Each card shows the name plus stage and draft/public
// state; switching preserves the current tab.
export function EventSwitcher({
  events,
  currentId,
  currentTab,
}: {
  events: Array<{ id: string; title: string; slug: string; status: string }>
  currentId: string | null
  currentTab: DashboardTabId
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const current = events.find((event) => event.id === currentId)
  const needle = query.trim().toLowerCase()
  const matches = events.filter(
    (event) =>
      needle === '' ||
      event.title.toLowerCase().includes(needle) ||
      event.slug.toLowerCase().includes(needle),
  )

  return (
    <div className="relative w-full max-w-md">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Switch event"
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-left text-[13px] transition-colors hover:bg-muted"
      >
        <Search size={15} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
          {current?.title ?? 'Select event'}
        </span>
        <ChevronsUpDown size={15} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-11 z-40 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search events…"
              aria-label="Search events"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
            />
          </div>
          <ul role="listbox" aria-label="Events" className="max-h-72 overflow-y-auto p-1">
            {matches.length === 0 && (
              <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">No events match.</li>
            )}
            {matches.map((event) => {
              const active = event.id === currentId
              const live = event.status !== 'DRAFT'
              return (
                <li key={event.id} role="option" aria-selected={active}>
                  <Link
                    href={`/console?eventId=${event.id}&tab=${currentTab}`}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted',
                      active && 'bg-muted',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-foreground">
                        {event.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="capitalize">{event.status.toLowerCase().replace('_', ' ')}</span>
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-px text-[10px] font-bold',
                            live ? 'bg-[#16a34a]/10 text-[#16a34a]' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {live ? 'Public' : 'Draft'}
                        </span>
                      </span>
                    </span>
                    {active && <Check size={15} strokeWidth={2} aria-hidden="true" className="shrink-0 text-[#16a34a]" />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
