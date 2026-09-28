import type { EventStatus } from '../db/schema'

// Listing tabs, in display order.
export type HackathonTab = 'live' | 'upcoming' | 'past'

// The homepage showcase lists events hackers can act on now or soon —
// live and upcoming, never past.
export function isShowcaseEvent(tab: HackathonTab): boolean {
  return tab === 'live' || tab === 'upcoming'
}

export const HACKATHON_TABS: Array<{ id: HackathonTab; label: string }> = [
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
]

// Maps an event's effective status onto a listing tab. Events accepting
// hackers now are live; drafts that never opened are upcoming; everything
// from judging onward is past.
export function classifyEventTab(status: EventStatus): HackathonTab {
  switch (status) {
    case 'REGISTRATION':
    case 'SUBMISSION':
      return 'live'
    case 'DRAFT':
      return 'upcoming'
    default:
      return 'past'
  }
}

export interface HackathonEvent {
  id: string
  slug: string
  title: string
  status: EventStatus
  tab: HackathonTab
  // Server-formatted range label (hydration-safe: the client renders it verbatim).
  dateLabel: string
  // Registration end, ISO string: sort key for the listing only.
  sortKey: string
}
