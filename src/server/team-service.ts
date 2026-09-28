import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import {
  deriveEventStatus,
  eventRoles,
  events,
  generateInviteToken,
  submissions,
  teamMembers,
  teams,
  users,
  type DbTeam,
  type DbUser,
} from '../db/schema'
import { AuthError, getEventRole, verifyPassword } from './auth-service'
import { getEventRow } from './event-service'
import { hashInviteToken } from '../lib/auth'
import {
  inviteExpiryFrom,
  isInviteExpired,
  isRosterFrozen,
  normalizeInviteToken,
} from '../lib/teams'

export interface TeamMemberView {
  userId: string
  name: string | null
  email: string
  role: 'LEADER' | 'MEMBER'
  joinedAt: string
  isSelf: boolean
}

export interface TeamSummary {
  team: {
    id: string
    eventId: string
    name: string
    inviteExpiresAt: string | null
    isLocked: boolean
  }
  members: TeamMemberView[]
  minTeamSize: number
  maxTeamSize: number
  frozen: boolean
  inviteExpired: boolean
  isLeader: boolean
}

// Join attempts per actor+event inside a rolling minute. Single-instance
// offline app: module memory is the store. Guesses stay cheap to reject.
const joinAttempts = new Map<string, number[]>()

function checkJoinRateLimit(key: string, now: number): void {
  const windowStart = now - 60_000
  const attempts = (joinAttempts.get(key) ?? []).filter((at) => at >= windowStart)
  if (attempts.length >= 5) throw new AuthError('RATE_LIMITED', 429)
  attempts.push(now)
  joinAttempts.set(key, attempts)
}

async function teamMembersView(teamId: string, selfId: string): Promise<TeamMemberView[]> {
  const rows = await db
    .select({
      userId: teamMembers.userId,
      role: teamMembers.role,
      joinedAt: teamMembers.joinedAt,
      name: users.name,
      email: users.email,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId))
  return rows
    .map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      role: row.role,
      joinedAt: row.joinedAt.toISOString(),
      isSelf: row.userId === selfId,
    }))
    .sort(
      (a, b) =>
        (a.role === 'LEADER' ? 0 : 1) - (b.role === 'LEADER' ? 0 : 1) ||
        (a.joinedAt < b.joinedAt ? -1 : a.joinedAt > b.joinedAt ? 1 : 0),
    )
}

async function summarize(
  actor: DbUser,
  team: DbTeam,
  now: Date = new Date(),
): Promise<TeamSummary> {
  const [event] = await db.select().from(events).where(eq(events.id, team.eventId)).limit(1)
  const members = await teamMembersView(team.id, actor.id)
  return {
    team: {
      id: team.id,
      eventId: team.eventId,
      name: team.name,
      inviteExpiresAt: team.inviteExpiresAt?.toISOString() ?? null,
      isLocked: team.isLocked,
    },
    members,
    minTeamSize: event?.minTeamSize ?? 1,
    maxTeamSize: event?.maxTeamSize ?? 4,
    frozen: isRosterFrozen(
      { isLocked: team.isLocked, registrationEnd: event?.registrationEnd ?? null },
      now,
    ),
    inviteExpired: isInviteExpired(team.inviteExpiresAt, now),
    isLeader: members.some((member) => member.userId === actor.id && member.role === 'LEADER'),
  }
}

async function requireMembership(actor: DbUser, teamId: string) {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1)
  if (!team) throw new AuthError('TEAM_NOT_FOUND', 404)
  const [event] = await db.select().from(events).where(eq(events.id, team.eventId)).limit(1)
  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actor.id)))
    .limit(1)
  if (!membership) throw new AuthError('NOT_IN_TEAM', 404)
  return { team, event, role: membership.role }
}

async function myTeamId(userId: string, eventId: string): Promise<string | null> {
  const rows = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(eq(teams.eventId, eventId), eq(teamMembers.userId, userId)))
    .limit(1)
  return rows[0]?.teamId ?? null
}

function assertRosterOpen(
  event: { registrationEnd: Date | null } | undefined,
  team: DbTeam,
  now: Date = new Date(),
): void {
  if (!event) throw new AuthError('EVENT_NOT_FOUND', 404)
  if (isRosterFrozen({ isLocked: team.isLocked, registrationEnd: event.registrationEnd }, now)) {
    throw new AuthError('TEAM_LOCKED', 409)
  }
}

// Own team read for the manage page. Null when the actor has no team.
export async function getMyTeam(actor: DbUser, eventId: string): Promise<TeamSummary | null> {
  const teamId = await myTeamId(actor.id, eventId)
  if (!teamId) return null
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1)
  if (!team) return null
  return summarize(actor, team)
}

// Team creation: registered participants only, one team per user per event,
// TEAM events in REGISTRATION or SUBMISSION phase. Returns the plaintext
// invite token once — only its hash is stored.
export async function createTeam(
  actor: DbUser,
  eventId: string,
  name: string,
  now: Date = new Date(),
): Promise<{ summary: TeamSummary; token: string }> {
  const event = await getEventRow(eventId)
  if (event.participationType !== 'TEAM') throw new AuthError('TEAM_NOT_ALLOWED', 409)
  const status = deriveEventStatus(event, now)
  if (status !== 'REGISTRATION' && status !== 'SUBMISSION') {
    throw new AuthError('EVENT_NOT_OPEN', 409)
  }
  const mapping = await getEventRole(actor.id, eventId)
  if (mapping !== 'PARTICIPANT') throw new AuthError('NOT_REGISTERED', 403)
  if (await myTeamId(actor.id, eventId)) throw new AuthError('TEAM_EXISTS', 409)
  const trimmed = name.trim()
  if (trimmed === '') throw new AuthError('VALIDATION_ERROR', 400)

  const token = generateInviteToken()
  const team = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(teams)
      .values({
        eventId,
        name: trimmed,
        inviteCodeHash: hashInviteToken(token),
        inviteExpiresAt: inviteExpiryFrom(now),
        isLocked: false,
      })
      .returning()
    await tx.insert(teamMembers).values({ teamId: row.id, userId: actor.id, role: 'LEADER' })
    return row
  })
  return { summary: await summarize(actor, team, now), token }
}

// Leader-only rename. Names are content, not roster — allowed when locked.
export async function renameTeam(
  actor: DbUser,
  teamId: string,
  name: string,
  now: Date = new Date(),
): Promise<TeamSummary> {
  const { team, event, role } = await requireMembership(actor, teamId)
  if (role !== 'LEADER') throw new AuthError('FORBIDDEN', 403)
  assertRosterOpen(event, team, now)
  const trimmed = name.trim()
  if (trimmed === '') throw new AuthError('VALIDATION_ERROR', 400)
  const [updated] = await db
    .update(teams)
    .set({ name: trimmed })
    .where(eq(teams.id, teamId))
    .returning()
  return summarize(actor, updated)
}

// Leader-only invite rotation. Returns the new plaintext token once.
// Frozen rosters cannot rotate: nobody can join them anyway.
export async function rotateInviteToken(
  actor: DbUser,
  teamId: string,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: string }> {
  const { team, event, role } = await requireMembership(actor, teamId)
  if (role !== 'LEADER') throw new AuthError('FORBIDDEN', 403)
  assertRosterOpen(event, team, now)
  const token = generateInviteToken()
  const expiresAt = inviteExpiryFrom(now)
  await db
    .update(teams)
    .set({ inviteCodeHash: hashInviteToken(token), inviteExpiresAt: expiresAt })
    .where(eq(teams.id, team.id))
  return { token, expiresAt: expiresAt.toISOString() }
}

// Invite-link resolution: find which event/team a token belongs to without
// joining. Unknown codes resolve null (the page shows "invalid"); expiry is
// reported so the page can say so before the signed-in join attempt.
export async function resolveInviteToken(
  rawToken: string,
  now: Date = new Date(),
): Promise<{
  eventId: string
  eventSlug: string
  eventTitle: string
  teamName: string
  expired: boolean
} | null> {
  const canonical = normalizeInviteToken(rawToken)
  if (canonical === '') return null
  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      inviteCodeHash: teams.inviteCodeHash,
      inviteExpiresAt: teams.inviteExpiresAt,
      eventId: teams.eventId,
      eventSlug: events.slug,
      eventTitle: events.title,
    })
    .from(teams)
    .innerJoin(events, eq(teams.eventId, events.id))
  const match = rows.find((row) => row.inviteCodeHash === hashInviteToken(canonical))
  if (!match) return null
  return {
    eventId: match.eventId,
    eventSlug: match.eventSlug,
    eventTitle: match.eventTitle,
    teamName: match.teamName,
    expired: isInviteExpired(match.inviteExpiresAt, now),
  }
}

// Join by pasted code or ?token= link. Unknown codes 404 (no expiry oracle),
// expired codes 410, full or frozen teams 409.
export async function joinTeamByToken(
  actor: DbUser,
  eventId: string,
  rawToken: string,
  now: Date = new Date(),
): Promise<TeamSummary> {
  checkJoinRateLimit(`${actor.id}:${eventId}`, now.getTime())
  const canonical = normalizeInviteToken(rawToken)
  if (canonical === '') throw new AuthError('INVITE_INVALID', 404)
  const event = await getEventRow(eventId)
  if (event.participationType !== 'TEAM') throw new AuthError('TEAM_NOT_ALLOWED', 409)
  const mapping = await getEventRole(actor.id, eventId)
  if (mapping !== 'PARTICIPANT') throw new AuthError('NOT_REGISTERED', 403)
  if (await myTeamId(actor.id, eventId)) throw new AuthError('TEAM_EXISTS', 409)

  const candidates = await db
    .select({ id: teams.id, inviteCodeHash: teams.inviteCodeHash })
    .from(teams)
    .where(eq(teams.eventId, eventId))
  const match = candidates.find((row) => row.inviteCodeHash === hashInviteToken(canonical))
  if (!match) throw new AuthError('INVITE_INVALID', 404)
  const [team] = await db.select().from(teams).where(eq(teams.id, match.id)).limit(1)
  if (isInviteExpired(team.inviteExpiresAt, now)) throw new AuthError('INVITE_EXPIRED', 410)
  assertRosterOpen(event, team, now)

  await db.transaction(async (tx) => {
    const count = await tx
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, team.id))
    if (count.length >= event.maxTeamSize) throw new AuthError('TEAM_FULL', 409)
    await tx.insert(teamMembers).values({ teamId: team.id, userId: actor.id, role: 'MEMBER' })
  })
  const [fresh] = await db.select().from(teams).where(eq(teams.id, team.id)).limit(1)
  return summarize(actor, fresh, now)
}

// Leave (members) or leave-with-transfer (leaders pass to the
// longest-tenured member). The last member out deletes the team.
export async function leaveTeam(
  actor: DbUser,
  teamId: string,
  now: Date = new Date(),
): Promise<{ transferredTo: string | null; deleted: boolean }> {
  const { team, event, role } = await requireMembership(actor, teamId)
  assertRosterOpen(event, team, now)
  if (role !== 'LEADER') {
    await db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actor.id)))
    return { transferredTo: null, deleted: false }
  }
  return db.transaction(async (tx) => {
    const successors = await tx
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'MEMBER')))
    successors.sort((a, b) => (a.joinedAt < b.joinedAt ? -1 : 1))
    // Delete first, then promote: the partial unique index never sees two
    // leaders at once.
    await tx
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actor.id)))
    const next = successors[0]
    if (!next) {
      await tx.delete(teams).where(eq(teams.id, teamId))
      // Last member out: the team is gone, so the registration goes with
      // it. Otherwise the event page keeps seeing a registered viewer with
      // no team and offers "Manage Team" instead of "Register".
      await tx
        .delete(eventRoles)
        .where(and(eq(eventRoles.eventId, event.id), eq(eventRoles.userId, actor.id)))
      return { transferredTo: null, deleted: true }
    }
    await tx
      .update(teamMembers)
      .set({ role: 'LEADER' })
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, next.userId)))
    return { transferredTo: next.userId, deleted: false }
  })
}

// Leader-only kick. Self-kicks go through leave; leaders are unk kickable.
export async function kickMember(
  actor: DbUser,
  teamId: string,
  targetUserId: string,
  now: Date = new Date(),
): Promise<TeamSummary> {
  const { team, event, role } = await requireMembership(actor, teamId)
  if (role !== 'LEADER') throw new AuthError('FORBIDDEN', 403)
  if (targetUserId === actor.id) throw new AuthError('CANNOT_KICK_SELF', 409)
  assertRosterOpen(event, team, now)
  const [target] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)))
    .limit(1)
  if (!target || target.role !== 'MEMBER') throw new AuthError('NOT_IN_TEAM', 404)
  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)))
  const [fresh] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1)
  return summarize(actor, fresh, now)
}

// Leader-only ownership handoff to a MEMBER. Frozen rosters stay frozen.
export async function transferLeadership(
  actor: DbUser,
  teamId: string,
  targetUserId: string,
  now: Date = new Date(),
): Promise<TeamSummary> {
  const { team, event, role } = await requireMembership(actor, teamId)
  if (role !== 'LEADER') throw new AuthError('FORBIDDEN', 403)
  assertRosterOpen(event, team, now)
  const [target] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)))
    .limit(1)
  if (!target || target.role !== 'MEMBER') throw new AuthError('NOT_IN_TEAM', 404)
  await db.transaction(async (tx) => {
    await tx
      .update(teamMembers)
      .set({ role: 'MEMBER' })
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actor.id)))
    await tx
      .update(teamMembers)
      .set({ role: 'LEADER' })
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)))
  })
  const [fresh] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1)
  return summarize(actor, fresh, now)
}

// Leader-only delete, confirmed with the actor's password. Cancelling
// unregisters every member from the event — the whole team leaves, so
// nobody is left registered-but-teamless. Submitted (locked) teams can
// still be cancelled; teams frozen only by registration_end cannot.
export async function deleteTeam(
  actor: DbUser,
  teamId: string,
  password: string,
  now: Date = new Date(),
): Promise<{ teamId: string; deleted: boolean }> {
  const { team, event, role } = await requireMembership(actor, teamId)
  if (role !== 'LEADER') throw new AuthError('FORBIDDEN', 403)
  if (!(await verifyPassword(actor.passwordHash, password))) {
    throw new AuthError('INVALID_CREDENTIALS', 401)
  }
  if (!team.isLocked) assertRosterOpen(event, team, now)
  const memberIds = (
    await db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
  ).map((row) => row.userId)
  await db.transaction(async (tx) => {
    if (memberIds.length > 0) {
      await tx
        .delete(eventRoles)
        .where(and(eq(eventRoles.eventId, team.eventId), inArray(eventRoles.userId, memberIds)))
    }
    await tx.delete(teams).where(eq(teams.id, teamId))
  })
  return { teamId, deleted: true }
}

// Team-level submit: the leader finalizes the roster with their own
// password. The roster must be complete (min–max); the lock is
// irreversible and also freezes renames, invites, and roster moves.
// Submitted project drafts finalize through finalizeSubmission instead.
export async function submitTeam(
  actor: DbUser,
  teamId: string,
  password: string,
  now: Date = new Date(),
): Promise<TeamSummary> {
  const { team, event, role } = await requireMembership(actor, teamId)
  if (role !== 'LEADER') throw new AuthError('FORBIDDEN', 403)
  if (!event) throw new AuthError('EVENT_NOT_FOUND', 404)
  if (!(await verifyPassword(actor.passwordHash, password))) {
    throw new AuthError('INVALID_CREDENTIALS', 401)
  }
  if (team.isLocked) throw new AuthError('ALREADY_SUBMITTED', 409)
  assertRosterOpen(event, team, now)
  const size = (
    await db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
  ).length
  if (size < event.minTeamSize || size > event.maxTeamSize) {
    throw new AuthError('TEAM_INCOMPLETE', 409)
  }
  const [updated] = await db.update(teams).set({ isLocked: true }).where(eq(teams.id, teamId)).returning()
  return summarize(actor, updated, now)
}

// Submission finalize: the leader flips DRAFT → submitted and locks the
// roster in one transaction, so no join/leave/kick can slip in after the
// project ships.
export async function finalizeSubmission(
  actor: DbUser,
  eventId: string,
  submissionId: string,
  password: string,
  now: Date = new Date(),
): Promise<{ submissionId: string; submitted: boolean }> {
  const [submission] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1)
  if (!submission) throw new AuthError('SUBMISSION_NOT_FOUND', 404)
  const [team] = await db.select().from(teams).where(eq(teams.id, submission.teamId)).limit(1)
  if (!team || team.eventId !== eventId) throw new AuthError('SUBMISSION_NOT_FOUND', 404)
  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, actor.id)))
    .limit(1)
  if (!membership) throw new AuthError('NOT_IN_TEAM', 404)
  if (membership.role !== 'LEADER') throw new AuthError('FORBIDDEN', 403)
  if (!(await verifyPassword(actor.passwordHash, password))) {
    throw new AuthError('INVALID_CREDENTIALS', 401)
  }
  if (!submission.isDraft) throw new AuthError('ALREADY_SUBMITTED', 409)
  if (!submission.trackId) throw new AuthError('TRACK_REQUIRED', 409)
  await db.transaction(async (tx) => {
    await tx
      .update(submissions)
      .set({ isDraft: false, submittedAt: now })
      .where(eq(submissions.id, submissionId))
    await tx.update(teams).set({ isLocked: true }).where(eq(teams.id, team.id))
  })
  return { submissionId, submitted: true }
}
