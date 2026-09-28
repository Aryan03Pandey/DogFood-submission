import { db } from '../db'
import { events } from '../db/schema'
import { deriveEventStatus } from '../db/schema'
import { formatSubmittedDate } from '../lib/gallery'
import { classifyEventTab, type HackathonEvent } from '../lib/hackathons'

// All datelined, non-draft events for the /hackathons listing, oldest
// first. Status is the effective phase-derived status so a stale stored
// flag never miscategorizes an event. Incomplete DRAFT shells (no
// registration end yet) are skipped: their status cannot be derived and
// they have nothing to display. Finished DRAFT rows are organizer-only and
// never leak into this public listing (or the homepage showcase built on
// it).
export async function getHackathonEvents(now = new Date()): Promise<HackathonEvent[]> {
  const rows = await db.select().from(events)

  return rows
    .flatMap((row) => {
      if (row.registrationEnd == null || row.submissionDeadline == null) return []
      const status = deriveEventStatus(row, now)
      if (status === 'DRAFT') return []
      return [
        {
          id: row.id,
          slug: row.slug,
          title: row.title,
          status,
          tab: classifyEventTab(status),
          dateLabel: `${formatSubmittedDate(row.registrationEnd.toISOString())} – ${formatSubmittedDate(row.submissionDeadline.toISOString())}`,
          sortKey: row.registrationEnd.toISOString(),
          cardBannerUrl: row.cardBannerUrl ?? null,
        },
      ]
    })
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
}
