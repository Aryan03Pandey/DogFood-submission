import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { events, submissions, teamMembers, teams, tracks, seededOrder } from '../db/schema'
import {
  formatSubmittedDate,
  isGalleryVisible,
  sortGalleryProjects,
  type GalleryProject,
} from '../lib/gallery'

export interface EventGalleryProject extends GalleryProject {
  trackId: string
}

// Public gallery feed: published submissions from completed (PUBLISHED)
// events. Draft/hidden filtering happens in SQL; the archived check applies
// the effective phase-derived status in JS so a stale stored flag can never
// leak an in-progress event's projects. An optional seed shuffles the order
// (bias mitigation) instead of the default sort.
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

// Event-scoped feed for the embeddable widget (embed.js / app/embed/[eventId]).
// Reuses the exact same isGalleryVisible/sortGalleryProjects rules as the
// instance-wide feed above — there is no second visibility query, only a
// narrower WHERE and an optional track filter for the one event being embedded.
export async function getEventGalleryProjects(
  eventId: string,
  options: { track?: string; limit?: number } = {},
  now = new Date(),
): Promise<EventGalleryProject[] | null> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1)
  if (!event) return null

  const rows = await db
    .select({ submission: submissions, team: teams, track: tracks })
    .from(submissions)
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .innerJoin(tracks, eq(submissions.trackId, tracks.id))
    .where(
      and(
        eq(teams.eventId, eventId),
        eq(submissions.isDraft, false),
        eq(submissions.isHidden, false),
        ...(options.track ? [eq(tracks.id, options.track)] : []),
      ),
    )

  const visible = rows
    .filter(
      (row) =>
        // Same guard as the instance-wide feed in getGalleryProjects: an
        // incomplete DRAFT shell (no submissionDeadline yet) can't derive a
        // trustworthy status and must never be listed here either.
        event.submissionDeadline != null &&
        isGalleryVisible({ isDraft: row.submission.isDraft, isHidden: row.submission.isHidden, event }, now),
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
      trackId: row.track.id,
      eventTitle: event.title,
      eventStatus: event.status,
    }))
    .sort(sortGalleryProjects)

  return typeof options.limit === 'number' ? visible.slice(0, options.limit) : visible
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
