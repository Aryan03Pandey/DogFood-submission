import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import {
  deriveEventStatus,
  events,
  submissionComments,
  submissions,
  teams,
  tracks,
  votes,
  seededOrder,
  type DbUser,
} from '../db/schema'
import { AuthError } from './auth-service'
import { getEventRow, assertEventOrganizer } from './event-service'
import { recordAuditLog } from './audit-service'
import { calculateProjectSimilarity } from '../lib/similarity'

export interface VoteAllocation {
  submissionId: string
  votes: number
}

export interface CastVoteInput {
  submissionId?: string
  votes?: number
  allocations?: VoteAllocation[]
  honeypot?: string
  formRenderedAt?: number
}

export async function castVote(
  actor: DbUser | null,
  eventId: string,
  fingerprint: string,
  input: CastVoteInput,
) {
  const event = await getEventRow(eventId)
  const currentStatus = deriveEventStatus(event)
  if (currentStatus !== 'PUBLIC_VOTING') {
    throw new AuthError('VOTING_CLOSED', 403)
  }

  const votingType = 'SINGLE_CHOICE'

  // Normalize allocations
  let rawAllocations: VoteAllocation[] = []
  if (input.allocations && input.allocations.length > 0) {
    rawAllocations = input.allocations
  } else if (input.submissionId) {
    rawAllocations = [{ submissionId: input.submissionId, votes: input.votes ?? 1 }]
  }

  if (rawAllocations.length === 0) {
    throw new AuthError('MISSING_VOTE_TARGET', 400)
  }

  // Deduplicate and aggregate allocations by submissionId
  const mergedMap = new Map<string, number>()
  for (const item of rawAllocations) {
    if (!Number.isInteger(item.votes) || item.votes < 1) {
      throw new AuthError('INVALID_VOTE_WEIGHT', 400)
    }
    mergedMap.set(item.submissionId, (mergedMap.get(item.submissionId) ?? 0) + item.votes)
  }

  const allocations: VoteAllocation[] = [...mergedMap.entries()].map(([submissionId, votes]) => ({
    submissionId,
    votes,
  }))

  // Single choice only: a voter may upvote many projects, but each
  // project gets at most one upvote from them (duplicates merge above, so
  // any weight above 1 means a repeated upvote and is rejected).
  for (const alloc of allocations) {
    if (alloc.votes !== 1) {
      throw new AuthError('INVALID_SINGLE_CHOICE_VOTE', 400)
    }
  }

  // Ensure submissions belong to the event and are submitted & visible
  const targetIds = allocations.map((a) => a.submissionId)
  const validSubmissions = await db
    .select({ id: submissions.id })
    .from(submissions)
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .where(
      and(
        eq(teams.eventId, eventId),
        inArray(submissions.id, targetIds),
        eq(submissions.isDraft, false),
        eq(submissions.isHidden, false),
      ),
    )

  if (validSubmissions.length !== targetIds.length) {
    throw new AuthError('INVALID_SUBMISSION_FOR_EVENT', 400)
  }

  // Atomic replacement of voter's ballot for this event
  await db.transaction(async (tx) => {
    await tx
      .delete(votes)
      .where(and(eq(votes.eventId, eventId), eq(votes.voterFingerprint, fingerprint)))

    await tx.insert(votes).values(
      allocations.map((alloc) => ({
        eventId,
        voterFingerprint: fingerprint,
        submissionId: alloc.submissionId,
        voteWeight: alloc.votes,
      })),
    )
  })

  // Append-only audit log entry
  await recordAuditLog({
    actorId: actor?.id ?? null,
    action: 'VOTE_CAST',
    entityType: 'EVENT',
    entityId: eventId,
    payloadJson: {
      fingerprint,
      votingType,
      allocations,
      cost: allocations.length,
    },
  })

  return {
    ok: true,
    votingType,
    allocations,
    creditsSpent: allocations.length,
    remainingCredits: null,
  }
}

export async function resetVote(
  actor: DbUser | null,
  eventId: string,
  fingerprint: string,
) {
  const event = await getEventRow(eventId)
  const currentStatus = deriveEventStatus(event)
  if (currentStatus !== 'PUBLIC_VOTING') {
    throw new AuthError('VOTING_CLOSED', 403)
  }

  await db
    .delete(votes)
    .where(and(eq(votes.eventId, eventId), eq(votes.voterFingerprint, fingerprint)))

  await recordAuditLog({
    actorId: actor?.id ?? null,
    action: 'VOTE_RESET',
    entityType: 'EVENT',
    entityId: eventId,
    payloadJson: { fingerprint },
  })

  return { ok: true }
}

export async function getVotingState(
  viewer: DbUser | null,
  eventId: string,
  fingerprint: string,
) {
  const event = await getEventRow(eventId)
  const status = deriveEventStatus(event)

  const isOrganizerOrAdmin =
    viewer?.role === 'SUPERADMIN' ||
    (viewer ? await assertEventOrganizer(viewer, eventId).then(() => true).catch(() => false) : false)

  // Fetch caller's current votes
  const userVotes = await db
    .select({
      submissionId: votes.submissionId,
      voteWeight: votes.voteWeight,
    })
    .from(votes)
    .where(and(eq(votes.eventId, eventId), eq(votes.voterFingerprint, fingerprint)))

  const allocations: VoteAllocation[] = userVotes.map((v) => ({
    submissionId: v.submissionId,
    votes: v.voteWeight,
  }))

  const votingType = 'SINGLE_CHOICE'

  const isBlindActive = event.blindVoting && status === 'PUBLIC_VOTING'

  // If blind voting is active and viewer is not organizer, mask the live tally
  if (isBlindActive && !isOrganizerOrAdmin) {
    return {
      eventId,
      status,
      votingType,
      blindVoting: true,
      isLiveTallyHidden: true,
      myVotes: allocations,
      results: null,
    }
  }

  // Tally votes
  const allVotes = await db
    .select({
      submissionId: votes.submissionId,
      voteWeight: votes.voteWeight,
    })
    .from(votes)
    .where(eq(votes.eventId, eventId))

  const tallyMap = new Map<string, { totalVotes: number; voterCount: number }>()
  for (const v of allVotes) {
    const current = tallyMap.get(v.submissionId) ?? { totalVotes: 0, voterCount: 0 }
    current.totalVotes += v.voteWeight
    current.voterCount += 1
    tallyMap.set(v.submissionId, current)
  }

  const projectRows = await db
    .select({
      id: submissions.id,
      title: submissions.title,
      teamName: teams.name,
      trackName: tracks.name,
    })
    .from(submissions)
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .innerJoin(tracks, eq(submissions.trackId, tracks.id))
    .where(
      and(
        eq(teams.eventId, eventId),
        eq(submissions.isDraft, false),
        eq(submissions.isHidden, false),
      ),
    )

  const results = projectRows
    .map((p) => {
      const tally = tallyMap.get(p.id) ?? { totalVotes: 0, voterCount: 0 }
      return {
        submissionId: p.id,
        title: p.title,
        teamName: p.teamName,
        trackName: p.trackName,
        totalVotes: tally.totalVotes,
        voterCount: tally.voterCount,
      }
    })
    .sort((a, b) => b.totalVotes - a.totalVotes || a.title.localeCompare(b.title))

  return {
    eventId,
    status,
    votingType,
    blindVoting: event.blindVoting,
    isLiveTallyHidden: false,
    myVotes: allocations,
    results,
  }
}

export interface VotingLeaderboardRow {
  submissionId: string
  title: string
  teamName: string
  trackName: string
  totalVotes: number
  voterCount: number
  commentCount: number
}

export interface VotingAnalytics {
  eventId: string
  status: string
  votingType: string
  blindVoting: boolean
  votingEnabled: boolean
  totalVotes: number
  totalVoters: number
  totalComments: number
  votedSubmissions: number
  leaderboard: VotingLeaderboardRow[]
}

// Organizer analytics for the admin Voting tab: full tally (never masked),
// voter counts, and comment counts per submission.
export async function getVotingAnalytics(actor: DbUser, eventId: string): Promise<VotingAnalytics> {
  await assertEventOrganizer(actor, eventId)
  const event = await getEventRow(eventId)
  const status = deriveEventStatus(event)

  const [voteRows, projectRows, commentRows] = await Promise.all([
    db
      .select({ submissionId: votes.submissionId, voteWeight: votes.voteWeight, fingerprint: votes.voterFingerprint })
      .from(votes)
      .where(eq(votes.eventId, eventId)),
    db
      .select({ id: submissions.id, title: submissions.title, teamName: teams.name, trackName: tracks.name })
      .from(submissions)
      .innerJoin(teams, eq(submissions.teamId, teams.id))
      .innerJoin(tracks, eq(submissions.trackId, tracks.id))
      .where(
        and(
          eq(teams.eventId, eventId),
          eq(submissions.isDraft, false),
          eq(submissions.isHidden, false),
        ),
      ),
    db
      .select({ submissionId: submissionComments.submissionId })
      .from(submissionComments)
      .innerJoin(submissions, eq(submissionComments.submissionId, submissions.id))
      .innerJoin(teams, eq(submissions.teamId, teams.id))
      .where(and(eq(teams.eventId, eventId), eq(submissionComments.isHidden, false))),
  ])

  const tally = new Map<string, { totalVotes: number; voters: Set<string> }>()
  for (const row of voteRows) {
    const entry = tally.get(row.submissionId) ?? { totalVotes: 0, voters: new Set<string>() }
    entry.totalVotes += row.voteWeight
    entry.voters.add(row.fingerprint)
    tally.set(row.submissionId, entry)
  }
  const commentsBySubmission = new Map<string, number>()
  for (const row of commentRows) {
    commentsBySubmission.set(row.submissionId, (commentsBySubmission.get(row.submissionId) ?? 0) + 1)
  }

  const leaderboard: VotingLeaderboardRow[] = projectRows
    .map((project) => {
      const entry = tally.get(project.id)
      return {
        submissionId: project.id,
        title: project.title,
        teamName: project.teamName,
        trackName: project.trackName,
        totalVotes: entry?.totalVotes ?? 0,
        voterCount: entry?.voters.size ?? 0,
        commentCount: commentsBySubmission.get(project.id) ?? 0,
      }
    })
    .sort((a, b) => b.totalVotes - a.totalVotes || a.title.localeCompare(b.title))

  return {
    eventId,
    status,
    votingType: event.votingType || 'SINGLE_CHOICE',
    blindVoting: event.blindVoting,
    votingEnabled: event.publicVotingStart !== null || event.publicVotingEndTime !== null,
    totalVotes: voteRows.reduce((sum, row) => sum + row.voteWeight, 0),
    totalVoters: new Set(voteRows.map((row) => row.fingerprint)).size,
    totalComments: commentRows.length,
    votedSubmissions: leaderboard.filter((row) => row.totalVotes > 0).length,
    leaderboard,
  }
}

export async function getVotingItemsShuffled(
  eventId: string,
  seed: string,
) {
  const projectRows = await db
    .select({
      id: submissions.id,
      title: submissions.title,
      tagline: submissions.tagline,
      description: submissions.description,
      repoUrl: submissions.repoUrl,
      demoUrl: submissions.demoUrl,
      techStack: submissions.techStack,
      assetKeys: submissions.assetKeys,
      teamName: teams.name,
      trackName: tracks.name,
    })
    .from(submissions)
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .innerJoin(tracks, eq(submissions.trackId, tracks.id))
    .where(
      and(
        eq(teams.eventId, eventId),
        eq(submissions.isDraft, false),
        eq(submissions.isHidden, false),
      ),
    )

  return seededOrder(projectRows, seed)
}

export async function detectDuplicateSubmissions(
  actor: DbUser,
  eventId: string,
  threshold = 0.65,
) {
  await assertEventOrganizer(actor, eventId)

  const items = await db
    .select({
      id: submissions.id,
      title: submissions.title,
      tagline: submissions.tagline,
      description: submissions.description,
      teamId: teams.id,
      teamName: teams.name,
    })
    .from(submissions)
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .where(eq(teams.eventId, eventId))

  const duplicates: Array<{
    submissionA: { id: string; title: string; teamName: string }
    submissionB: { id: string; title: string; teamName: string }
    similarityScore: number
  }> = []

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const score = calculateProjectSimilarity(items[i], items[j])
      if (score >= threshold) {
        duplicates.push({
          submissionA: { id: items[i].id, title: items[i].title, teamName: items[i].teamName },
          submissionB: { id: items[j].id, title: items[j].title, teamName: items[j].teamName },
          similarityScore: score,
        })
      }
    }
  }

  return duplicates.sort((a, b) => b.similarityScore - a.similarityScore)
}