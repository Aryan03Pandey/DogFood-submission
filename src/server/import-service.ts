import { randomBytes } from 'node:crypto'
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
import { hashPassword } from './auth-service'
import { slugify } from '../lib/fixtures'
import { exportEnvelopeSchema, type ExportData, type ExportEnvelope } from '../lib/api/export-schema'
import { verifyEnvelope } from './signing-service'

export class ImportError extends Error {
  status: number
  constructor(
    public code: string,
    status: number,
  ) {
    super(code)
    this.status = status
  }
}

export interface ImportOptions {
  dryRun?: boolean
  force?: boolean
  // Who triggered this import, for the audit_logs row — omitted only by the
  // CLI's direct-DB path, which has no session/user to attribute to.
  actorId?: string
}

export interface ImportSummary {
  dryRun: boolean
  counts: Record<string, number>
  // User IDs that had no password_hash in the payload and were assigned a
  // shared, unusable placeholder — these accounts need a real password set
  // via the API or dogfood-cli before anyone can log in as them.
  placeholderPasswordUserIds: string[]
}

// docker compose up always seeds baseline users + the fixture event, so
// "any row exists" is always true post-boot — that would make --force
// mandatory even for a brand-new install. "Non-empty" instead means: any
// real user-created data beyond that known seed/fixture baseline.
export const FIXTURE_SLUG = slugify('Sample Hack 2026')

// Pure decision, exported so it's testable with fabricated inputs and no
// live database — isInstanceEmpty() below is the only thing that fetches
// these flags for real.
export function isEmptyGiven(flags: {
  hasTeams: boolean
  hasSubmissions: boolean
  hasScores: boolean
  hasVotes: boolean
  hasPairwiseComparisons: boolean
  eventSlugs: string[]
}): boolean {
  if (flags.hasTeams || flags.hasSubmissions || flags.hasScores || flags.hasVotes || flags.hasPairwiseComparisons) {
    return false
  }
  return flags.eventSlugs.every((slug) => slug === FIXTURE_SLUG)
}

async function isInstanceEmpty(): Promise<boolean> {
  const [hasTeams] = await db.select({ id: teams.id }).from(teams).limit(1)
  const [hasSubmissions] = await db.select({ id: submissions.id }).from(submissions).limit(1)
  const [hasScores] = await db.select({ id: scores.id }).from(scores).limit(1)
  const [hasVotes] = await db.select({ id: votes.id }).from(votes).limit(1)
  const [hasPairwise] = await db.select({ id: pairwiseComparisons.id }).from(pairwiseComparisons).limit(1)
  const eventRows = await db.select({ slug: events.slug }).from(events)

  return isEmptyGiven({
    hasTeams: !!hasTeams,
    hasSubmissions: !!hasSubmissions,
    hasScores: !!hasScores,
    hasVotes: !!hasVotes,
    hasPairwiseComparisons: !!hasPairwise,
    eventSlugs: eventRows.map((e) => e.slug),
  })
}

// Pure predicate, exported for its own unit test: a row needs a placeholder
// whenever the export omitted its password_hash (the default — see
// docs/TIER4.md 4.3), regardless of *why* it was omitted.
export function needsPlaceholderPassword(row: { passwordHash?: string | null }): boolean {
  return !row.passwordHash
}

// Thrown from inside the transaction to force a rollback for --dry-run even
// though every write "succeeded" — caught immediately outside the
// transaction, which is the only reliable way to run the real write path and
// still guarantee nothing persists.
class DryRunRollback extends Error {
  constructor(public summary: ImportSummary) {
    super('dry-run rollback (not a real error)')
  }
}

// Not typed against drizzle's transaction generics: the exact PgTransaction<>
// signature is an implementation detail of the postgres-js driver binding,
// and every call below only relies on the same insert()/select() surface
// `db` itself exposes.
type Tx = Pick<typeof db, 'insert' | 'select'>

export async function importData(payload: unknown, options: ImportOptions = {}): Promise<ImportSummary> {
  // Every export produced by export-service.ts is signed (format
  // "dogfood-signed", type "export") — unwrap and verify it here. A plain,
  // unsigned ExportEnvelope is still accepted unchanged for backward
  // compatibility with hand-built fixtures and anything exported before
  // signing was added; only a *signed* envelope with a *bad* signature is
  // rejected outright, since that's the one case a caller claimed integrity
  // and didn't have it.
  let unwrapped = payload
  if (typeof payload === 'object' && payload !== null && (payload as { format?: unknown }).format === 'dogfood-signed') {
    const result = await verifyEnvelope(payload)
    if (!result.valid) throw new ImportError('INVALID_SIGNATURE', 400)
    unwrapped = (payload as { payload: unknown }).payload
  }
  const envelope: ExportEnvelope = exportEnvelopeSchema.parse(unwrapped)

  if (envelope.scope === 'instance' && !options.force && !(await isInstanceEmpty())) {
    throw new ImportError('INSTANCE_NOT_EMPTY', 409)
  }

  let summary: ImportSummary
  try {
    summary = await db.transaction(async (tx) => {
      const result = await applyImport(tx, envelope.data)
      if (options.dryRun) throw new DryRunRollback(result)
      return result
    })
  } catch (error) {
    if (error instanceof DryRunRollback) {
      summary = { ...error.summary, dryRun: true }
    } else {
      throw error
    }
  }

  // Logged outside the transaction, and for a dry run too — a dry run's
  // writes roll back, but the fact that someone probed an import (with what
  // it would have done) is itself worth a permanent record.
  await db.insert(auditLogs).values({
    actorId: options.actorId ?? null,
    action: 'import.applied',
    entityType: 'instance',
    payloadJson: { scope: envelope.scope, dryRun: !!options.dryRun, counts: summary.counts },
  })

  return summary
}

async function applyImport(tx: Tx, data: ExportData): Promise<ImportSummary> {
  const counts: Record<string, number> = {}
  const placeholderPasswordUserIds: string[] = []
  let placeholderHash: string | null = null
  const getPlaceholderHash = async () => {
    if (!placeholderHash) placeholderHash = await hashPassword(randomBytes(24).toString('hex'))
    return placeholderHash
  }

  for (const row of data.users) {
    const placeholder = needsPlaceholderPassword(row)
    const passwordHash = placeholder ? await getPlaceholderHash() : (row.passwordHash as string)
    if (placeholder) placeholderPasswordUserIds.push(row.id)
    await tx
      .insert(users)
      .values({
        id: row.id,
        email: row.email,
        name: row.name,
        firstName: row.firstName,
        lastName: row.lastName,
        countryCode: row.countryCode,
        phoneNumber: row.phoneNumber,
        profession: row.profession,
        country: row.country,
        skills: row.skills ?? [],
        linkedinUrl: row.linkedinUrl,
        githubUrl: row.githubUrl,
        profileComplete: row.profileComplete,
        passwordHash,
        role: row.role,
        organization: row.organization,
        createdAt: new Date(row.createdAt),
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: row.email,
          name: row.name,
          firstName: row.firstName,
          lastName: row.lastName,
          countryCode: row.countryCode,
          phoneNumber: row.phoneNumber,
          profession: row.profession,
          country: row.country,
          skills: row.skills ?? [],
          linkedinUrl: row.linkedinUrl,
          githubUrl: row.githubUrl,
          profileComplete: row.profileComplete,
          role: row.role,
          organization: row.organization,
        },
      })
  }
  counts.users = data.users.length

  for (const row of data.user_projects) {
    await tx
      .insert(userProjects)
      .values({ ...row, createdAt: new Date(row.createdAt) })
      .onConflictDoUpdate({
        target: userProjects.id,
        set: { title: row.title, description: row.description, repoUrl: row.repoUrl, hostedUrl: row.hostedUrl },
      })
  }
  counts.user_projects = data.user_projects.length

  for (const row of data.events) {
    const dates = {
      registrationEnd: row.registrationEnd ? new Date(row.registrationEnd) : null,
      submissionStart: row.submissionStart ? new Date(row.submissionStart) : null,
      submissionDeadline: row.submissionDeadline ? new Date(row.submissionDeadline) : null,
      judgingStart: row.judgingStart ? new Date(row.judgingStart) : null,
      judgingEndTime: row.judgingEndTime ? new Date(row.judgingEndTime) : null,
      publicVotingStart: row.publicVotingStart ? new Date(row.publicVotingStart) : null,
      publicVotingEndTime: row.publicVotingEndTime ? new Date(row.publicVotingEndTime) : null,
      announcementDate: row.announcementDate ? new Date(row.announcementDate) : null,
    }
    // id/createdAt are set-once — excluded from the update branch so a
    // re-import can never rewrite either.
    const { id: _id, createdAt: _createdAt, ...updatableFields } = row
    await tx
      .insert(events)
      .values({ ...row, ...dates, createdAt: new Date(row.createdAt) })
      .onConflictDoUpdate({
        target: events.id,
        set: { ...updatableFields, ...dates },
      })
  }
  counts.events = data.events.length

  for (const row of data.event_roles) {
    await tx
      .insert(eventRoles)
      .values({ id: row.id, eventId: row.eventId, userId: row.userId, role: row.role, createdAt: new Date(row.createdAt) })
      .onConflictDoUpdate({ target: eventRoles.id, set: { role: row.role } })
  }
  counts.event_roles = data.event_roles.length

  for (const row of data.tracks) {
    await tx
      .insert(tracks)
      .values({ id: row.id, eventId: row.eventId, name: row.name, description: row.description, eligibilityRules: row.eligibilityRules ?? {} })
      .onConflictDoUpdate({ target: tracks.id, set: { name: row.name, description: row.description, eligibilityRules: row.eligibilityRules ?? {} } })
  }
  counts.tracks = data.tracks.length

  for (const row of data.prizes) {
    await tx
      .insert(prizes)
      .values(row)
      .onConflictDoUpdate({ target: prizes.id, set: { title: row.title, cashValue: row.cashValue, trackId: row.trackId } })
  }
  counts.prizes = data.prizes.length

  for (const row of data.teams) {
    const inviteExpiresAt = row.inviteExpiresAt ? new Date(row.inviteExpiresAt) : null
    await tx
      .insert(teams)
      .values({ ...row, inviteExpiresAt, createdAt: new Date(row.createdAt) })
      .onConflictDoUpdate({
        target: teams.id,
        set: { name: row.name, inviteCodeHash: row.inviteCodeHash, inviteExpiresAt, isLocked: row.isLocked },
      })
  }
  counts.teams = data.teams.length

  for (const row of data.team_members) {
    await tx
      .insert(teamMembers)
      .values({ ...row, joinedAt: new Date(row.joinedAt) })
      .onConflictDoUpdate({ target: teamMembers.id, set: { role: row.role } })
  }
  counts.team_members = data.team_members.length

  for (const row of data.submissions) {
    await tx
      .insert(submissions)
      .values({
        ...row,
        techStack: row.techStack ?? [],
        assetKeys: row.assetKeys ?? [],
        submittedAt: row.submittedAt ? new Date(row.submittedAt) : null,
        updatedAt: new Date(row.updatedAt),
      })
      .onConflictDoUpdate({
        target: submissions.id,
        set: {
          title: row.title,
          tagline: row.tagline,
          description: row.description,
          techStack: row.techStack ?? [],
          repoUrl: row.repoUrl,
          demoUrl: row.demoUrl,
          assetKeys: row.assetKeys ?? [],
          isDraft: row.isDraft,
          isHidden: row.isHidden,
          submittedAt: row.submittedAt ? new Date(row.submittedAt) : null,
          updatedAt: new Date(row.updatedAt),
        },
      })
  }
  counts.submissions = data.submissions.length

  for (const row of data.rubrics) {
    await tx
      .insert(rubrics)
      .values(row)
      .onConflictDoUpdate({ target: rubrics.id, set: { title: row.title, criteriaJson: row.criteriaJson } })
  }
  counts.rubrics = data.rubrics.length

  for (const row of data.judge_tracks) {
    // No mutable fields beyond the FK pair itself — nothing to update.
    await tx.insert(judgeTracks).values(row).onConflictDoNothing({ target: judgeTracks.id })
  }
  counts.judge_tracks = data.judge_tracks.length

  for (const row of data.conflicts_of_interest) {
    await tx
      .insert(conflictsOfInterest)
      .values({ ...row, createdAt: new Date(row.createdAt) })
      .onConflictDoUpdate({ target: conflictsOfInterest.id, set: { reason: row.reason } })
  }
  counts.conflicts_of_interest = data.conflicts_of_interest.length

  for (const row of data.judge_assignments) {
    await tx
      .insert(judgeAssignments)
      .values(row)
      .onConflictDoUpdate({ target: judgeAssignments.id, set: { status: row.status } })
  }
  counts.judge_assignments = data.judge_assignments.length

  for (const row of data.scores) {
    await tx
      .insert(scores)
      .values({ ...row, submittedAt: new Date(row.submittedAt) })
      .onConflictDoUpdate({
        target: scores.id,
        set: { rubricScoresJson: row.rubricScoresJson, rawTotal: row.rawTotal, comment: row.comment },
      })
  }
  counts.scores = data.scores.length

  for (const row of data.pairwise_comparisons) {
    // Immutable once recorded — nothing to update on conflict.
    await tx
      .insert(pairwiseComparisons)
      .values({ ...row, createdAt: new Date(row.createdAt) })
      .onConflictDoNothing({ target: pairwiseComparisons.id })
  }
  counts.pairwise_comparisons = data.pairwise_comparisons.length

  for (const row of data.votes) {
    await tx
      .insert(votes)
      .values({ ...row, createdAt: new Date(row.createdAt) })
      .onConflictDoUpdate({ target: votes.id, set: { voteWeight: row.voteWeight } })
  }
  counts.votes = data.votes.length

  for (const row of data.prize_awards) {
    await tx
      .insert(prizeAwards)
      .values({ ...row, awardedAt: new Date(row.awardedAt) })
      .onConflictDoUpdate({ target: prizeAwards.id, set: { submissionId: row.submissionId } })
  }
  counts.prize_awards = data.prize_awards.length

  // Append-only: never rewritten on conflict, only ever inserted once.
  for (const row of data.audit_logs) {
    await tx
      .insert(auditLogs)
      .values({ ...row, createdAt: new Date(row.createdAt) })
      .onConflictDoNothing({ target: auditLogs.id })
  }
  counts.audit_logs = data.audit_logs.length

  for (const row of data.signing_keys) {
    await tx
      .insert(signingKeys)
      .values({ ...row, createdAt: new Date(row.createdAt), retiredAt: row.retiredAt ? new Date(row.retiredAt) : null })
      .onConflictDoNothing({ target: signingKeys.kid })
  }
  counts.signing_keys = data.signing_keys.length

  return { dryRun: false, counts, placeholderPasswordUserIds }
}
