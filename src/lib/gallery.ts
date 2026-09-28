import {
  deriveEventStatus,
  type DbEvent,
  type EventStatus,
} from '../db/schema'

// One gallery row: a submission plus the names needed to display and search
// it. Dates cross the server/client boundary as ISO strings.
export interface GalleryProject {
  id: string
  title: string
  tagline: string | null
  repoUrl: string | null
  submittedAt: string | null
  // Preformatted on the server: formatting dates during render produces
  // different strings on the server and the client (timezone/locale) and
  // breaks hydration. The client must render this verbatim.
  submittedLabel: string | null
  teamName: string
  trackName: string
  eventTitle: string
  eventStatus: EventStatus
}

// Server-side date label. Fixed locale AND timezone so the string is
// identical wherever it renders — a hydration-safe display value.
export function formatSubmittedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Threat-model rule (draft leakage): the gallery shows only published
// submissions from completed events. An event counts as completed when its
// effective status — derived from the phase columns, not just the stored
// flag — is PUBLISHED.
export function isGalleryVisible(
  input: { isDraft: boolean; isHidden: boolean; event: DbEvent },
  now = new Date(),
): boolean {
  if (input.isDraft || input.isHidden) return false
  return deriveEventStatus(input.event, now) === 'PUBLISHED'
}

// Search across project title, tagline, team, track, and event. Every query
// term must appear somewhere (AND); matching is case-insensitive.
export function matchesGalleryQuery(
  project: Pick<
    GalleryProject,
    'title' | 'tagline' | 'teamName' | 'trackName' | 'eventTitle'
  >,
  query: string,
): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = [project.title, project.tagline, project.teamName, project.trackName, project.eventTitle]
    .filter((field): field is string => field !== null)
    .join('\n')
    .toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

// Deterministic ordering (threat model: no list bias): oldest submission
// first, rows without a timestamp last, title as the tiebreak.
export function sortGalleryProjects(a: GalleryProject, b: GalleryProject): number {
  const aTime = a.submittedAt ?? null
  const bTime = b.submittedAt ?? null
  if (aTime !== bTime) {
    if (aTime === null) return 1
    if (bTime === null) return -1
    return aTime < bTime ? -1 : 1
  }
  if (a.title === b.title) return a.id < b.id ? -1 : 1
  return a.title < b.title ? -1 : 1
}
