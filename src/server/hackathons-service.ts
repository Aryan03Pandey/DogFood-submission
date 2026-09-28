import { db } from '../db'
import { events } from '../db/schema'
import { deriveEventStatus } from '../db/schema'
import { formatSubmittedDate } from '../lib/gallery'
import { classifyEventTab, type HackathonEvent } from '../lib/hackathons'

// All datelined events for the /hackathons listing, oldest first. Status is
// the effective phase-derived status so a stale stored flag never
// miscategorizes an event. Incomplete DRAFT shells (no registration end
// yet) are skipped: their status cannot be derived and they have nothing
// to display.
export async function getHackathonEvents(now = new Date()): Promise<HackathonEvent[]> {
  const rows = await db.select().from(events)

  return rows
    .flatMap((row) => {
      if (row.registrationEnd == null || row.submissionDeadline == null) return []
      const status = deriveEventStatus(row, now)
      return [
        {
          id: row.id,
          slug: row.slug,
          title: row.title,
          status,
          tab: classifyEventTab(status),
          dateLabel: `${formatSubmittedDate(row.registrationEnd.toISOString())} – ${formatSubmittedDate(row.submissionDeadline.toISOString())}`,
          sortKey: row.registrationEnd.toISOString(),
        },
      ]
    })
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
}
