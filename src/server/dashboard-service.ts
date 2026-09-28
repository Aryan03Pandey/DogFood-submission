import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import {
  deriveEventStatus,
  eventRoles,
  events,
  judgeAssignments,
  pairwiseComparisons,
  prizes,
  scores,
  submissions,
  teamMembers,
  teams,
  tracks,
  users,
  votes,
  type DbUser,
} from '../db/schema'
import { AuthError, getEffectiveRole, verifyPassword } from './auth-service'
import { assertEventOrganizer } from './event-service'
import { recordAuditLog } from './audit-service'

// Admin-dashboard read model + organizer mutations (ADMIN-DASHBOARD.md).
// Every function is scoped to one event; route handlers enforce the
// organizer check with assertEventOrganizer before calling in.

export interface DashboardParticipant {
  userId: string
  email: string
  name: string | null
  organization: string | null
  teamName: string | null
  memberRole: string | null
  registeredAt: string
}

export interface DashboardSubmission {
  id: string
  title: string
  teamName: string
  trackName: string
  status: 'draft' | 'final'
  isHidden: boolean
  repoUrl: string | null
  demoUrl: string | null
  submittedAt: string | null
  updatedAt: string
}

export interface DashboardGalleryItem {
  id: string
  title: string
  teamName: string
  trackName: string
  isHidden: boolean
  submittedAt: string | null
}

export interface DashboardMember {
  userId: string
  email: string
  name: string | null
  role: string
  createdAt: string
}

export interface DashboardOverview {
  eventId: string
  status: string
  totalParticipants: number
  totalTeams: number
  totalSubmissions: number
  finalSubmissions: number
  activeSubmissions: number
  hiddenSubmissions: number
  reviewedSubmissions: number
  totalJudges: number
  totalVotes: number
  activity: Array<{ date: string; count: number }>
}

async function getEventRow(eventId: string) {
  const [row] = await db.select().from(events).where(eq(events.id, eventId)).limit(1)
  if (!row) throw new AuthError('EVENT_NOT_FOUND', 404)
  return row
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export async function getDashboardOverview(eventId: string, now = new Date()): Promise<DashboardOverview> {
  const event = await getEventRow(eventId)
  const [roleRows, teamRows, submissionRows, assignmentRows, scoreRows, voteRows] = await Promise.all([
    db.select({ id: eventRoles.id }).from(eventRoles).where(and(eq(eventRoles.eventId, eventId), eq(eventRoles.role, 'PARTICIPANT'))),
    db.select({ id: teams.id }).from(teams).where(eq(teams.eventId, eventId)),
    db
      .select({ id: submissions.id, isDraft: submissions.isDraft, isHidden: submissions.isHidden, submittedAt: submissions.submittedAt })
      .from(submissions)
      .innerJoin(teams, eq(submissions.teamId, teams.id))
      .where(eq(teams.eventId, eventId)),
    db.select({ id: judgeAssignments.id, judgeId: judgeAssignments.judgeId }).from(judgeAssignments).where(eq(judgeAssignments.eventId, eventId)),
    db
      .select({ submissionId: scores.submissionId })
      .from(scores)
      .innerJoin(judgeAssignments, eq(scores.assignmentId, judgeAssignments.id))
      .where(eq(judgeAssignments.eventId, eventId)),
    db.select({ id: votes.id }).from(votes).where(eq(votes.eventId, eventId)),
  ])
  const reviewed = new Set(scoreRows.map((row) => row.submissionId))
  const activity = new Map<string, number>()
  for (let back = 13; back >= 0; back -= 1) {
    const day = new Date(now)
    day.setUTCDate(day.getUTCDate() - back)
    activity.set(dayKey(day), 0)
  }
  for (const row of submissionRows) {
    if (!row.submittedAt) continue
    const key = dayKey(row.submittedAt)
    if (activity.has(key)) activity.set(key, (activity.get(key) ?? 0) + 1)
  }
  const finals = submissionRows.filter((row) => !row.isDraft)
  return {
    eventId,
    status: deriveEventStatus(event, now),
    totalParticipants: roleRows.length,
    totalTeams: teamRows.length,
    totalSubmissions: submissionRows.length,
    finalSubmissions: finals.length,
    activeSubmissions: finals.filter((row) => !row.isHidden).length,
    hiddenSubmissions: finals.filter((row) => row.isHidden).length,
    reviewedSubmissions: reviewed.size,
    totalJudges: new Set(assignmentRows.map((row) => row.judgeId)).size,
    totalVotes: voteRows.length,
    activity: [...activity.entries()].map(([date, count]) => ({ date, count })),
  }
}

// Registered participants (PARTICIPANT mappings) with their team context:
// team leaders/members resolve through team_members; users without a team
// row for this event report a null team (individual participation).
// Every event mapping with user identity: feeds the organizer editor
// (server-rendered, so the shared roles API response stays unchanged).
export async function listEventMembers(eventId: string): Promise<DashboardMember[]> {
  const rows = await db
    .select({ role: eventRoles, user: users })
    .from(eventRoles)
    .innerJoin(users, eq(eventRoles.userId, users.id))
    .where(eq(eventRoles.eventId, eventId))
  return rows.map(({ role, user }) => ({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: role.role,
    createdAt: role.createdAt.toISOString(),
  }))
}

export async function listDashboardParticipants(eventId: string): Promise<DashboardParticipant[]> {
  const rows = await db
    .select({ role: eventRoles, user: users })
    .from(eventRoles)
    .innerJoin(users, eq(eventRoles.userId, users.id))
    .where(and(eq(eventRoles.eventId, eventId), eq(eventRoles.role, 'PARTICIPANT')))
  const memberships = await db
    .select({ userId: teamMembers.userId, role: teamMembers.role, teamName: teams.name })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teams.eventId, eventId))
  const teamByUser = new Map(memberships.map((row) => [row.userId, row]))
  return rows.map(({ role, user }) => {
    const team = teamByUser.get(user.id)
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      organization: user.organization,
      teamName: team?.teamName ?? null,
      memberRole: team?.role ?? null,
      registeredAt: role.createdAt.toISOString(),
    }
  })
}

export interface SubmissionPageQuery {
  page?: number
  pageSize?: number
  query?: string
  status?: 'draft' | 'final'
  track?: string
}

export interface SubmissionPage {
  rows: DashboardSubmission[]
  total: number
  page: number
  pageSize: number
  tracks: string[]
}

// Paginated + searchable view over the submissions table (Submissions tab).
// Filtering runs in memory over the event's rows: event submission counts
// stay in the hundreds on this offline instance, so a keyset query buys
// nothing over one join plus a slice.
export async function listDashboardSubmissionsPage(
  eventId: string,
  options: SubmissionPageQuery = {},
): Promise<SubmissionPage> {
  const all = await listDashboardSubmissions(eventId)
  const needle = (options.query ?? '').trim().toLowerCase()
  const filtered = all.filter((row) => {
    if (options.status && row.status !== options.status) return false
    if (options.track && row.trackName !== options.track) return false
    if (
      needle !== '' &&
      !`${row.title} ${row.teamName} ${row.trackName}`.toLowerCase().includes(needle)
    ) {
      return false
    }
    return true
  })
  const pageSize = Math.min(Math.max(Math.floor(options.pageSize ?? 10), 1), 100)
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(Math.max(Math.floor(options.page ?? 1), 1), totalPages)
  return {
    rows: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    page,
    pageSize,
    tracks: [...new Set(all.map((row) => row.trackName))].sort(),
  }
}

export async function listDashboardSubmissions(eventId: string): Promise<DashboardSubmission[]> {
  const rows = await db
    .select({ submission: submissions, team: teams, track: tracks })
    .from(submissions)
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .innerJoin(tracks, eq(submissions.trackId, tracks.id))
    .where(eq(teams.eventId, eventId))
  return rows.map(({ submission, team, track }) => ({
    id: submission.id,
    title: submission.title,
    teamName: team.name,
    trackName: track.name,
    status: submission.isDraft ? ('draft' as const) : ('final' as const),
    isHidden: submission.isHidden,
    repoUrl: submission.repoUrl,
    demoUrl: submission.demoUrl,
    submittedAt: submission.submittedAt?.toISOString() ?? null,
    updatedAt: submission.updatedAt.toISOString(),
  }))
}

export async function listDashboardGallery(eventId: string): Promise<DashboardGalleryItem[]> {
  const rows = await db
    .select({
      id: submissions.id,
      title: submissions.title,
      isHidden: submissions.isHidden,
      submittedAt: submissions.submittedAt,
      teamName: teams.name,
      trackName: tracks.name,
    })
    .from(submissions)
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .innerJoin(tracks, eq(submissions.trackId, tracks.id))
    .where(eq(teams.eventId, eventId))
  return rows.map((row) => ({ ...row, submittedAt: row.submittedAt?.toISOString() ?? null }))
}

export async function setSubmissionHidden(
  actor: DbUser,
  eventId: string,
  submissionId: string,
  hidden: boolean,
) {
  await assertEventOrganizer(actor, eventId)
  const [row] = await db
    .select({ submission: submissions })
    .from(submissions)
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .where(and(eq(submissions.id, submissionId), eq(teams.eventId, eventId)))
    .limit(1)
  if (!row) throw new AuthError('SUBMISSION_NOT_FOUND', 404)
  const [updated] = await db
    .update(submissions)
    .set({ isHidden: hidden })
    .where(eq(submissions.id, submissionId))
    .returning()
  await recordAuditLog({
    actorId: actor.id,
    action: 'SUBMISSION_VISIBILITY_OVERRIDE',
    entityType: 'SUBMISSION',
    entityId: submissionId,
    payloadJson: { isHidden: hidden, eventId },
  })
  return updated
}

// Organizer-or-superadmin delete, confirmed with the actor's password.
// Cascades clear tracks, prizes, teams, roles, rubrics, and assignments;
// votes, comparisons, and scores reference without cascade and are removed
// first explicitly.
export async function deleteEvent(actor: DbUser, eventId: string, password: string) {
  await getEventRow(eventId)
  // Event deletion is admin-only: organizers manage content, they cannot
  // destroy the event itself.
  if (actor.role !== 'SUPERADMIN') throw new AuthError('FORBIDDEN', 403)
  if (!(await verifyPassword(actor.passwordHash, password))) {
    throw new AuthError('INVALID_CREDENTIALS', 401)
  }
  const submissionIds = (
    await db
      .select({ id: submissions.id })
      .from(submissions)
      .innerJoin(teams, eq(submissions.teamId, teams.id))
      .where(eq(teams.eventId, eventId))
  ).map((row) => row.id)
  if (submissionIds.length > 0) {
    await db.delete(scores).where(inArray(scores.submissionId, submissionIds))
  }
  
  await db.delete(votes).where(eq(votes.eventId, eventId))
  await db.delete(pairwiseComparisons).where(eq(pairwiseComparisons.eventId, eventId))
  // Track references are deliberately non-cascading (prizes and submissions
  // may outlive track edits), so detach them before the event delete
  // cascades the tracks away. Everything below vanishes with the event.
  const eventTrackIds = (
    await db.select({ id: tracks.id }).from(tracks).where(eq(tracks.eventId, eventId))
  ).map((row) => row.id)
  if (eventTrackIds.length > 0) {
    await db.update(submissions).set({ trackId: null }).where(inArray(submissions.trackId, eventTrackIds))
    await db.update(prizes).set({ trackId: null }).where(inArray(prizes.trackId, eventTrackIds))
  }
  await db.delete(events).where(eq(events.id, eventId))
   await recordAuditLog({
    actorId: actor.id,
    action: 'EVENT_DELETED',
    entityType: 'EVENT',
    entityId: eventId,
  })
  return { eventId, deleted: true as const }
}

export async function removeEventRole(actor: DbUser, eventId: string, targetUserId: string) {
  await getEventRow(eventId)
  const role = await getEffectiveRole(actor, eventId)
  if (role !== 'SUPERADMIN' && role !== 'ORGANIZER') throw new AuthError('FORBIDDEN', 403)
  if (targetUserId === actor.id) throw new AuthError('CANNOT_REMOVE_SELF', 409)
  const [removed] = await db
    .delete(eventRoles)
    .where(and(eq(eventRoles.eventId, eventId), eq(eventRoles.userId, targetUserId)))
    .returning()
  await recordAuditLog({
    actorId: actor.id,
    action: 'EVENT_ROLE_REMOVED',
    entityType: 'EVENT',
    entityId: eventId,
    payloadJson: { removedUserId: targetUserId },
  })

  if (!removed) throw new AuthError('ROLE_NOT_FOUND', 404)
  return removed
}

export interface EventExportTables {
  eventTitle: string
  eventStatus: string
  participants: DashboardParticipant[]
  teams: Array<{ name: string; memberCount: number; finalized: boolean }>
  submissions: DashboardSubmission[]
  voting: Array<{
    title: string
    teamName: string
    trackName: string
    totalVotes: number
    voterCount: number
    commentCount: number
  }>
}

// Small tables for the full event export (participants, teams,
// submissions, voting). Organizer-scoped. The wide judging section streams
// separately through streamCsvRows, so this stays light.
export async function getEventExportTables(
  actor: DbUser,
  eventId: string,
): Promise<EventExportTables> {
  const event = await getEventRow(eventId)
  await assertEventOrganizer(actor, eventId)
  const { getVotingAnalytics } = await import('./voting-service')
  const [participants, submissionRows, analytics, teamRows, memberRows, finalizedRows] =
    await Promise.all([
      listDashboardParticipants(eventId),
      listDashboardSubmissions(eventId),
      getVotingAnalytics(actor, eventId),
      db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.eventId, eventId)),
      db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .innerJoin(teams, eq(teamMembers.teamId, teams.id))
        .where(eq(teams.eventId, eventId)),
      db
        .select({ teamId: submissions.teamId })
        .from(submissions)
        .innerJoin(teams, eq(submissions.teamId, teams.id))
        .where(
          and(
            eq(teams.eventId, eventId),
            eq(submissions.isDraft, false),
            eq(submissions.isHidden, false),
          ),
        ),
    ])
  const counts = new Map<string, number>()
  for (const row of memberRows) counts.set(row.teamId, (counts.get(row.teamId) ?? 0) + 1)
  const finalized = new Set(finalizedRows.map((row) => row.teamId))
  return {
    eventTitle: event.title,
    eventStatus: deriveEventStatus(event),
    participants,
    teams: teamRows.map((team) => ({
      name: team.name,
      memberCount: counts.get(team.id) ?? 0,
      finalized: finalized.has(team.id),
    })),
    submissions: submissionRows,
    voting: analytics.leaderboard.map((row) => ({
      title: row.title,
      teamName: row.teamName,
      trackName: row.trackName,
      totalVotes: row.totalVotes,
      voterCount: row.voterCount,
      commentCount: row.commentCount,
    })),
  }
}

// Minimal CSV builder (no dependency): quotes fields containing commas,
// quotes, or newlines per RFC 4180.
export function toCsv(headers: string[], rows: Array<Array<string | null>>): string {
  const escape = (value: string | null): string => {
    const text = value ?? ''
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n') + '\n'
}
