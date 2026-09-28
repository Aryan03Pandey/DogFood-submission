import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { events, submissions, teamMembers, teams, tracks, seededOrder } from '../db/schema'
import {
  formatSubmittedDate,
  isGalleryVisible,
  sortGalleryProjects,
  type GalleryProject,
} from '../lib/gallery'

export async function getGalleryProjects(now = new Date(), seed?: string): Promise<GalleryProject[]> {
  const rows = await db
    .select({ submission: submissions, team: teams, track: tracks, event: events })
    .from(submissions)
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .innerJoin(tracks, eq(submissions.trackId, tracks.id))
    .innerJoin(events, eq(teams.eventId, events.id))
    .where(and(eq(submissions.isDraft, false), eq(submissions.isHidden, false)))

  const projects = rows
    .filter(
      (row) =>
        row.event.submissionDeadline != null &&
        isGalleryVisible(
          { isDraft: row.submission.isDraft, isHidden: row.submission.isHidden, event: row.event },
          now,
        ),
    )
    .map((row) => ({
      id: row.submission.id,
      title: row.submission.title,
      tagline: row.submission.tagline,
      repoUrl: row.submission.repoUrl,
      submittedAt: row.submission.submittedAt?.toISOString() ?? null,
      submittedLabel: row.submission.submittedAt
        ? formatSubmittedDate(row.submission.submittedAt.toISOString())
        : null,
      teamName: row.team.name,
      trackName: row.track.name,
      eventTitle: row.event.title,
      eventStatus: row.event.status,
    }))

  if (seed) {
    return seededOrder(projects, seed)
  }

  return projects.sort(sortGalleryProjects)
}

// Public project page: one published, visible submission with everything the
// detail view needs (assets included). Hidden/draft rows are always null;
// in-flight work additionally needs the viewer to sit on the team, so
// strangers cannot probe ids while owners can always see their own work.
export async function getGalleryProjectById(id: string, now = new Date(), viewerId?: string | null) {
  const [row] = await db
    .select({ submission: submissions, team: teams, track: tracks, event: events })
    .from(submissions)
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .innerJoin(tracks, eq(submissions.trackId, tracks.id))
    .innerJoin(events, eq(teams.eventId, events.id))
    .where(and(eq(submissions.id, id), eq(submissions.isDraft, false), eq(submissions.isHidden, false)))
    .limit(1)
  if (!row) return null
  const visible =
    row.event.submissionDeadline != null &&
    isGalleryVisible(
      { isDraft: row.submission.isDraft, isHidden: row.submission.isHidden, event: row.event },
      now,
    )
  if (!visible) {
    if (!viewerId) return null
    const [membership] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, row.team.id), eq(teamMembers.userId, viewerId)))
      .limit(1)
    if (!membership) return null
  }
  return {
    ...row.submission,
    submittedAt: row.submission.submittedAt?.toISOString() ?? null,
    teamName: row.team.name,
    trackName: row.track.name,
    eventId: row.event.id,
    eventTitle: row.event.title,
    eventSlug: row.event.slug,
  }
}

// My Projects: every submission on a team the viewer belongs (or belonged)
// to, newest event first. Includes the event slug so each card links onward.
export async function getMyProjects(userId: string) {
  const rows = await db
    .select({ submission: submissions, team: teams, event: events })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .innerJoin(submissions, eq(submissions.teamId, teams.id))
    .innerJoin(events, eq(teams.eventId, events.id))
    .where(eq(teamMembers.userId, userId))
  return rows.map((row) => ({
    id: row.submission.id,
    title: row.submission.title,
    tagline: row.submission.tagline,
    teamName: row.team.name,
    eventTitle: row.event.title,
    eventSlug: row.event.slug,
  }))
}