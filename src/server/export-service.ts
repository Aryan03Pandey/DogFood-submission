import { inArray, eq } from 'drizzle-orm'
import { db } from '../db'
import {
  auditLogs,
  conflictsOfInterest,
  eventRoles,
  events,
  judgeAssignments,
  judgeTracks,
  pairwiseComparisons,
  prizeAwards,
  prizes,
  rubrics,
  scores,
  signingKeys,
  submissions,
  teamMembers,
  teams,
  tracks,
  userProjects,
  users,
  votes,
} from '../db/schema'
import type { ExportData, ExportEnvelope } from '../lib/api/export-schema'
import { signEnvelope, type SignedEnvelope } from './signing-service'

// signEnvelope's payload is `unknown` for generality (it signs any of the
// four envelope types); every export always wraps an ExportEnvelope
// specifically, so callers get that narrower, precise shape instead.
export type SignedExportEnvelope = Omit<SignedEnvelope, 'payload'> & { payload: ExportEnvelope }

export interface ExportOptions {
  includeCredentials?: boolean
  // Who triggered this export, for the audit_logs row — omitted only by the
  // CLI's direct-DB path, which has no session/user to attribute to.
  actorId?: string
}

// Every table's password_hash / sensitive column is stripped here unless
// explicitly requested (CLI only — the HTTP export route never accepts
// includeCredentials). Order matches EXPORT_TABLE_ORDER / the FK-safe import
// order in import-service.ts; every query is explicitly ordered by id so two
// exports of unchanged data are byte-identical apart from exported_at.
async function buildExportData(
  scope: 'event' | 'instance',
  eventIds: string[] | null, // null = every event (instance scope)
  options: ExportOptions,
): Promise<ExportData> {
  const eventRows = eventIds
    ? await db.select().from(events).where(inArray(events.id, eventIds)).orderBy(events.id)
    : await db.select().from(events).orderBy(events.id)
  const resolvedEventIds = eventRows.map((e) => e.id)

  const trackRows = resolvedEventIds.length
    ? await db.select().from(tracks).where(inArray(tracks.eventId, resolvedEventIds)).orderBy(tracks.id)
    : []
  const trackIds = trackRows.map((t) => t.id)

  const prizeRows = resolvedEventIds.length
    ? await db.select().from(prizes).where(inArray(prizes.eventId, resolvedEventIds)).orderBy(prizes.id)
    : []

  const teamRows = resolvedEventIds.length
    ? await db.select().from(teams).where(inArray(teams.eventId, resolvedEventIds)).orderBy(teams.id)
    : []
  const teamIds = teamRows.map((t) => t.id)

  const teamMemberRows = teamIds.length
    ? await db.select().from(teamMembers).where(inArray(teamMembers.teamId, teamIds)).orderBy(teamMembers.id)
    : []

  const submissionRows = teamIds.length
    ? await db.select().from(submissions).where(inArray(submissions.teamId, teamIds)).orderBy(submissions.id)
    : []
  const submissionIds = submissionRows.map((s) => s.id)

  const rubricRows = resolvedEventIds.length
    ? await db.select().from(rubrics).where(inArray(rubrics.eventId, resolvedEventIds)).orderBy(rubrics.id)
    : []

  const judgeTrackRows = trackIds.length
    ? await db.select().from(judgeTracks).where(inArray(judgeTracks.trackId, trackIds)).orderBy(judgeTracks.id)
    : []

  const conflictOfInterestRows = resolvedEventIds.length
    ? await db
        .select()
        .from(conflictsOfInterest)
        .where(inArray(conflictsOfInterest.eventId, resolvedEventIds))
        .orderBy(conflictsOfInterest.id)
    : []

  const judgeAssignmentRows = resolvedEventIds.length
    ? await db
        .select()
        .from(judgeAssignments)
        .where(inArray(judgeAssignments.eventId, resolvedEventIds))
        .orderBy(judgeAssignments.id)
    : []
  const assignmentIds = judgeAssignmentRows.map((a) => a.id)

  const scoreRows = assignmentIds.length
    ? await db.select().from(scores).where(inArray(scores.assignmentId, assignmentIds)).orderBy(scores.id)
    : []

  const pairwiseRows = resolvedEventIds.length
    ? await db
        .select()
        .from(pairwiseComparisons)
        .where(inArray(pairwiseComparisons.eventId, resolvedEventIds))
        .orderBy(pairwiseComparisons.id)
    : []

  const voteRows = resolvedEventIds.length
    ? await db.select().from(votes).where(inArray(votes.eventId, resolvedEventIds)).orderBy(votes.id)
    : []

  // prize_awards has no direct event_id column; sliced via the already
  // event-scoped prizeRows, same reasoning as everything else here.
  const prizeIds = prizeRows.map((p) => p.id)
  const prizeAwardRows = prizeIds.length
    ? await db.select().from(prizeAwards).where(inArray(prizeAwards.prizeId, prizeIds)).orderBy(prizeAwards.id)
    : []

  const eventRoleRows = resolvedEventIds.length
    ? await db.select().from(eventRoles).where(inArray(eventRoles.eventId, resolvedEventIds)).orderBy(eventRoles.id)
    : []

  // Every user referenced anywhere in the sliced data (instance scope just
  // takes every user directly instead of unioning — it's the same result,
  // cheaper to compute).
  const userIds = new Set<string>([
    ...eventRoleRows.map((r) => r.userId),
    ...teamMemberRows.map((r) => r.userId),
    ...judgeTrackRows.map((r) => r.judgeId),
    ...conflictOfInterestRows.map((r) => r.judgeId),
    ...judgeAssignmentRows.map((r) => r.judgeId),
    ...scoreRows.map((r) => r.judgeId),
    ...pairwiseRows.map((r) => r.judgeId),
    ...prizeAwardRows.map((r) => r.awardedBy),
  ])
  const userRows =
    scope === 'instance'
      ? await db.select().from(users).orderBy(users.id)
      : userIds.size
        ? await db.select().from(users).where(inArray(users.id, [...userIds])).orderBy(users.id)
        : []
  const resolvedUserIds = userRows.map((u) => u.id)

  const userProjectRows = resolvedUserIds.length
    ? await db.select().from(userProjects).where(inArray(userProjects.userId, resolvedUserIds)).orderBy(userProjects.id)
    : []

  // audit_logs has no event_id column (it logs against arbitrary entity
  // types), so it cannot be reliably sliced per event; it is only included
  // in instance-scope exports/backups. Documented in docs/TIER4.md.
  const auditLogRows = scope === 'instance' ? await db.select().from(auditLogs).orderBy(auditLogs.id) : []

  // Public keys only, never the private PEM; included regardless of scope
  // (small, and needed to verify any signed artifact this instance issued).
  const signingKeyRows = await db.select().from(signingKeys).orderBy(signingKeys.kid)

  return {
    users: userRows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      firstName: u.firstName,
      lastName: u.lastName,
      countryCode: u.countryCode,
      phoneNumber: u.phoneNumber,
      profession: u.profession,
      country: u.country,
      skills: u.skills ?? [],
      linkedinUrl: u.linkedinUrl,
      githubUrl: u.githubUrl,
      profileComplete: u.profileComplete,
      passwordHash: options.includeCredentials ? u.passwordHash : undefined,
      role: u.role,
      organization: u.organization,
      createdAt: u.createdAt.toISOString(),
    })),
    user_projects: userProjectRows.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
    event_roles: eventRoleRows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    events: eventRows.map((e) => ({
      ...e,
      registrationEnd: e.registrationEnd?.toISOString() ?? null,
      submissionStart: e.submissionStart?.toISOString() ?? null,
      submissionDeadline: e.submissionDeadline?.toISOString() ?? null,
      judgingStart: e.judgingStart?.toISOString() ?? null,
      judgingEndTime: e.judgingEndTime?.toISOString() ?? null,
      publicVotingStart: e.publicVotingStart?.toISOString() ?? null,
      publicVotingEndTime: e.publicVotingEndTime?.toISOString() ?? null,
      announcementDate: e.announcementDate?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
    tracks: trackRows.map((t) => ({ ...t, eligibilityRules: t.eligibilityRules ?? {} })),
    prizes: prizeRows,
    teams: teamRows.map((t) => ({
      ...t,
      inviteExpiresAt: t.inviteExpiresAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
    team_members: teamMemberRows.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
    submissions: submissionRows.map((s) => ({
      ...s,
      techStack: s.techStack ?? [],
      assetKeys: s.assetKeys ?? [],
      submittedAt: s.submittedAt?.toISOString() ?? null,
      updatedAt: s.updatedAt.toISOString(),
    })),
    rubrics: rubricRows,
    judge_tracks: judgeTrackRows,
    conflicts_of_interest: conflictOfInterestRows.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    judge_assignments: judgeAssignmentRows,
    scores: scoreRows.map((s) => ({ ...s, submittedAt: s.submittedAt.toISOString() })),
    pairwise_comparisons: pairwiseRows.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
    votes: voteRows.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })),
    prize_awards: prizeAwardRows.map((a) => ({ ...a, awardedAt: a.awardedAt.toISOString() })),
    audit_logs: auditLogRows.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    signing_keys: signingKeyRows.map((k) => ({
      ...k,
      createdAt: k.createdAt.toISOString(),
      retiredAt: k.retiredAt?.toISOString() ?? null,
    })),
  }
}

async function logExport(scope: 'event' | 'instance', actorId: string | undefined, eventId?: string): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: actorId ?? null,
    action: 'export.created',
    entityType: scope === 'event' ? 'event' : 'instance',
    entityId: eventId ?? null,
    payloadJson: { scope },
  })
}

// Every export is signed (type "export") before it ever leaves this module:
// a restore can then prove the file wasn't altered in transit, and /verify
// has something real to check. import-service.ts unwraps+verifies this same
// shape, but still accepts a plain (unsigned) ExportEnvelope for backward
// compatibility with hand-built fixtures/tests.
export async function exportEvent(eventId: string, options: ExportOptions = {}): Promise<SignedExportEnvelope> {
  const envelope: ExportEnvelope = {
    format: 'dogfood-export',
    version: 1,
    exported_at: new Date().toISOString(),
    scope: 'event',
    data: await buildExportData('event', [eventId], options),
  }
  await logExport('event', options.actorId, eventId)
  return (await signEnvelope('export', envelope)) as SignedExportEnvelope
}

export async function exportInstance(options: ExportOptions = {}): Promise<SignedExportEnvelope> {
  const envelope: ExportEnvelope = {
    format: 'dogfood-export',
    version: 1,
    exported_at: new Date().toISOString(),
    scope: 'instance',
    data: await buildExportData('instance', null, options),
  }
  await logExport('instance', options.actorId)
  return (await signEnvelope('export', envelope)) as SignedExportEnvelope
}

export async function eventExists(eventId: string): Promise<boolean> {
  const [row] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1)
  return !!row
}
