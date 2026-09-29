// Judge assignment + rankings (split from judging-service.ts, which keeps
// scoring, flags, rubrics, judges, conflicts, and pairwise ballots).
// Assignment engines, organizer progress, and every ranking column live
// here; judging-service.ts imports getRankings back for the CSV streamer.
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  conflictsOfInterest,
  eventRoles,
  events,
  judgeAssignments,
  judgeTracks,
  pairwiseComparisons,
  scores,
  submissions,
  teamMembers,
  teams,
  tracks,
  users,
  bradleyTerryProbability,
  type DbUser,
} from "../db/schema";
import {
  minMaxNormalize,
  rotateOrder,
  trimmedMean,
  zScoreNormalize,
} from "../lib/judging/normalization";
import { AuthError, getEffectiveRole } from "./auth-service";
import { recordAuditLog } from "./audit-service";

async function assertOrganizer(actor: DbUser, eventId: string) {
  const role = await getEffectiveRole(actor, eventId);
  if (role !== "SUPERADMIN" && role !== "ORGANIZER")
    throw new AuthError("FORBIDDEN", 403);
}

export async function generateAssignments(
  actor: DbUser,
  eventId: string,
  trackId?: string,
) {
  await assertOrganizer(actor, eventId);

  const result = await db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    if (!event) throw new AuthError("EVENT_NOT_FOUND", 404);
    const eventTracks = await tx
      .select({ id: tracks.id })
      .from(tracks)
      .where(eq(tracks.eventId, eventId));
    const trackIds = eventTracks.map((track) => track.id);
    const selectedTrackIds = trackId
      ? trackIds.filter((id) => id === trackId)
      : trackIds;
    if (trackId && selectedTrackIds.length === 0)
      throw new AuthError("TRACK_NOT_FOUND", 404);
    if (selectedTrackIds.length === 0)
      return { assignmentsCreated: 0, unresolved: [] };

    const eligibleRows = await tx
      .select({
        judgeId: eventRoles.userId,
        trackId: judgeTracks.trackId,
        organization: users.organization,
      })
      .from(eventRoles)
      .innerJoin(users, eq(eventRoles.userId, users.id))
      .innerJoin(judgeTracks, eq(judgeTracks.judgeId, eventRoles.userId))
      .where(
        and(
          eq(eventRoles.eventId, eventId),
          eq(eventRoles.role, "JUDGE"),
          inArray(judgeTracks.trackId, selectedTrackIds),
        ),
      );
    const eligibleByTrack = new Map<
      string,
      Array<{ id: string; organization: string | null }>
    >();
    for (const row of eligibleRows) {
      const judges = eligibleByTrack.get(row.trackId) ?? [];
      if (!judges.some((judge) => judge.id === row.judgeId))
        judges.push({ id: row.judgeId, organization: row.organization });
      eligibleByTrack.set(row.trackId, judges);
    }

    const submissionRows = await tx
      .select({
        id: submissions.id,
        trackId: submissions.trackId,
        teamId: submissions.teamId,
      })
      .from(submissions)
      .innerJoin(tracks, eq(submissions.trackId, tracks.id))
      .where(
        and(
          eq(tracks.eventId, eventId),
          eq(submissions.isDraft, false),
          eq(submissions.isHidden, false),
          inArray(submissions.trackId, selectedTrackIds),
        ),
      );
    const memberRows = await tx
      .select({
        teamId: teamMembers.teamId,
        userId: users.id,
        organization: users.organization,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teams.eventId, eventId));
    const eventJudges = await tx
      .select({ judgeId: eventRoles.userId, organization: users.organization })
      .from(eventRoles)
      .innerJoin(users, eq(eventRoles.userId, users.id))
      .where(
        and(eq(eventRoles.eventId, eventId), eq(eventRoles.role, "JUDGE")),
      );
    const membersByTeam = new Map<string, typeof memberRows>();
    for (const member of memberRows)
      membersByTeam.set(member.teamId, [
        ...(membersByTeam.get(member.teamId) ?? []),
        member,
      ]);

    const heuristicConflicts: Array<{
      eventId: string;
      judgeId: string;
      teamId: string;
      reason: string;
    }> = [];
    for (const [teamId, members] of membersByTeam) {
      for (const judge of eventJudges) {
        let reason: string | undefined;
        if (members.some((member) => member.userId === judge.judgeId))
          reason = "team_member";
        else if (
          judge.organization?.trim() &&
          members.some(
            (member) =>
              member.organization?.trim().toLowerCase() ===
              judge.organization!.trim().toLowerCase(),
          )
        )
          reason = "same_org";
        if (reason)
          heuristicConflicts.push({
            eventId,
            judgeId: judge.judgeId,
            teamId,
            reason,
          });
      }
    }
    if (heuristicConflicts.length > 0) {
      await tx
        .insert(conflictsOfInterest)
        .values(heuristicConflicts)
        .onConflictDoNothing();
    }
    const eventConflicts = await tx
      .select({
        judgeId: conflictsOfInterest.judgeId,
        teamId: conflictsOfInterest.teamId,
      })
      .from(conflictsOfInterest)
      .where(eq(conflictsOfInterest.eventId, eventId));
    const conflictKeys = new Set(
      eventConflicts.map(
        (conflict) => `${conflict.judgeId}:${conflict.teamId}`,
      ),
    );
    const existing = await tx
      .select({
        judgeId: judgeAssignments.judgeId,
        submissionId: judgeAssignments.submissionId,
      })
      .from(judgeAssignments)
      .where(eq(judgeAssignments.eventId, eventId));
    const assignedBySubmission = new Map<string, Set<string>>();
    const load = new Map<string, number>();
    for (const assignment of existing) {
      assignedBySubmission.set(
        assignment.submissionId,
        (assignedBySubmission.get(assignment.submissionId) ?? new Set()).add(
          assignment.judgeId,
        ),
      );
      load.set(assignment.judgeId, (load.get(assignment.judgeId) ?? 0) + 1);
    }
    const targets = submissionRows.map((submission) => ({
      ...submission,
      // Finals always carry a track (finalize requires one); the inner join
      // above already excludes anything else.
      trackId: submission.trackId as string,
      assigned: assignedBySubmission.get(submission.id) ?? new Set<string>(),
    }));
    const blocked = new Set<string>();
    let assignmentsCreated = 0;
    // Organizer-selected algorithm (events.assignment_algorithm). K-cover
    // deals the least-loaded eligible judge; round-robin walks a fixed
    // rotation so queue lengths stay equal by construction. Both fill every
    // submission up to judgesPerSubmission and skip conflicts/duplicates.
    const algorithm = event.assignmentAlgorithm ?? "K_COVER";
    const rotation = [...new Set(eligibleRows.map((row) => row.judgeId))].sort();
    let pointer = 0;
    while (true) {
      const next = targets
        .filter(
          (submission) =>
            !blocked.has(submission.id) &&
            submission.assigned.size < event.judgesPerSubmission,
        )
        .sort(
          (a, b) =>
            a.assigned.size - b.assigned.size || a.id.localeCompare(b.id),
        )[0];
      if (!next) break;
      const shortlist = (eligibleByTrack.get(next.trackId) ?? []).filter(
        (judge) =>
          !next.assigned.has(judge.id) &&
          !conflictKeys.has(`${judge.id}:${next.teamId}`),
      );
      let judge: { id: string; organization: string | null } | undefined;
      if (algorithm === "ROUND_ROBIN" && rotation.length > 0) {
        judge = rotateOrder(rotation, pointer)
          .map((id) => shortlist.find((entry) => entry.id === id))
          .find((entry) => entry !== undefined);
        if (judge) pointer = (rotation.indexOf(judge.id) + 1) % rotation.length;
      } else {
        judge = shortlist.sort(
          (a, b) =>
            (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) ||
            a.id.localeCompare(b.id),
        )[0];
      }
      if (!judge) {
        blocked.add(next.id);
        continue;
      }
      await tx.insert(judgeAssignments).values({
        eventId,
        submissionId: next.id,
        judgeId: judge.id,
        status: "PENDING",
      });
      next.assigned.add(judge.id);
      load.set(judge.id, (load.get(judge.id) ?? 0) + 1);
      assignmentsCreated += 1;
    }
    
    return {
      assignmentsCreated,
      unresolved: targets
        .filter(
          (submission) => submission.assigned.size < event.judgesPerSubmission,
        )
        .map((submission) => ({
          submissionId: submission.id,
          assigned: submission.assigned.size,
          required: event.judgesPerSubmission,
        })),
    };
  });
  await recordAuditLog({
    actorId: actor.id,
    action: 'ASSIGNMENTS_GENERATED',
    entityType: 'EVENT',
    entityId: eventId,
    payloadJson: {
      assignmentsCreated: result.assignmentsCreated,
      unresolved: result.unresolved.length,
      trackId: trackId ?? null,
    },
  });
  return result;
}

export async function getAssignmentProgress(actor: DbUser, eventId: string) {
  await assertOrganizer(actor, eventId);
  const judges = await db
    .select({
      judgeId: eventRoles.userId,
      name: users.name,
      email: users.email,
    })
    .from(eventRoles)
    .innerJoin(users, eq(eventRoles.userId, users.id))
    .where(and(eq(eventRoles.eventId, eventId), eq(eventRoles.role, "JUDGE")));
  const assignmentRows = await db
    .select({ id: judgeAssignments.id, judgeId: judgeAssignments.judgeId })
    .from(judgeAssignments)
    .where(eq(judgeAssignments.eventId, eventId));
  const completedRows = await db
    .select({ assignmentId: scores.assignmentId })
    .from(scores)
    .innerJoin(judgeAssignments, eq(scores.assignmentId, judgeAssignments.id))
    .where(eq(judgeAssignments.eventId, eventId));
  const completed = new Set(completedRows.map((row) => row.assignmentId));
  return judges.map((judge) => {
    const assignments = assignmentRows.filter(
      (row) => row.judgeId === judge.judgeId,
    );
    const completedCount = assignments.filter((row) =>
      completed.has(row.id),
    ).length;
    return {
      ...judge,
      assigned: assignments.length,
      completed: completedCount,
      pending: assignments.length - completedCount,
    };
  });
}

export async function getRankings(actor: DbUser, eventId: string) {
  await assertOrganizer(actor, eventId);
  return computeRankings(eventId);
}

// Same computation as getRankings, for the one caller allowed to see it
// without being this event's organizer: the public results manifest
// (records-service.ts), which only calls this once deriveEventStatus(event)
// is PUBLISHED — that check lives there, not here, since this function has
// no actor to check a role against.
export async function getPublishedRankings(eventId: string) {
  return computeRankings(eventId);
}

async function computeRankings(eventId: string) {
  const rows = await db
    .select({
      submissionId: submissions.id,
      title: submissions.title,
      teamName: teams.name,
      judgeId: scores.judgeId,
      value: scores.rawTotal,
    })
    .from(scores)
    .innerJoin(judgeAssignments, eq(scores.assignmentId, judgeAssignments.id))
    .innerJoin(submissions, eq(scores.submissionId, submissions.id))
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .where(eq(judgeAssignments.eventId, eventId));
  const allSubmissions = await db
    .select({
      submissionId: submissions.id,
      title: submissions.title,
      teamName: teams.name,
    })
    .from(submissions)
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .innerJoin(tracks, eq(submissions.trackId, tracks.id))
    .where(
      and(
        eq(tracks.eventId, eventId),
        eq(submissions.isDraft, false),
        eq(submissions.isHidden, false),
      ),
    );
  const details = new Map(
    allSubmissions.map((row) => [
      row.submissionId,
      { ...row, values: [] as number[] },
    ]),
  );
  for (const row of rows) details.get(row.submissionId)?.values.push(row.value);
  const rawBySubmission = [...details.values()].map((row) => ({
    ...row,
    raw: row.values.length
      ? row.values.reduce((sum, value) => sum + value, 0) / row.values.length
      : 0,
  }));
  const zValues = zScoreNormalize(
    rows.map((row) => ({
      judgeId: row.judgeId,
      submissionId: row.submissionId,
      value: row.value,
    })),
  );
  const zBySubmission = new Map<string, number[]>();
  for (const row of zValues)
    zBySubmission.set(row.submissionId, [
      ...(zBySubmission.get(row.submissionId) ?? []),
      row.value,
    ]);
  const minMax = minMaxNormalize(rawBySubmission.map((row) => row.raw));
  return rawBySubmission
    .map((row, index) => ({
      submissionId: row.submissionId,
      title: row.title,
      teamName: row.teamName,
      scoreCount: row.values.length,
      raw: row.raw,
      zScore: (zBySubmission.get(row.submissionId) ?? []).reduce(
        (sum, value, _, values) => sum + value / Math.max(1, values.length),
        0,
      ),
      minMax: minMax[index],
      trimmedMean: trimmedMean(row.values),
    }))
    .sort(
      (a, b) => b.raw - a.raw || a.submissionId.localeCompare(b.submissionId),
    );
}

export async function getPairwiseRankings(actor: DbUser, eventId: string) {
  await assertOrganizer(actor, eventId);
  const projects = await db
    .select({ submissionId: submissions.id, title: submissions.title })
    .from(submissions)
    .innerJoin(tracks, eq(submissions.trackId, tracks.id))
    .where(
      and(
        eq(tracks.eventId, eventId),
        eq(submissions.isDraft, false),
        eq(submissions.isHidden, false),
      ),
    );
  const comparisons = await db
    .select()
    .from(pairwiseComparisons)
    .where(eq(pairwiseComparisons.eventId, eventId));
  const strengths = new Map(
    projects.map((project) => [project.submissionId, 1]),
  );
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const wins = new Map(projects.map((project) => [project.submissionId, 0]));
    const denominator = new Map(
      projects.map((project) => [project.submissionId, 0]),
    );
    for (const comparison of comparisons) {
      wins.set(
        comparison.winnerSubmissionId,
        (wins.get(comparison.winnerSubmissionId) ?? 0) + 1,
      );
      const total =
        (strengths.get(comparison.winnerSubmissionId) ?? 1) +
        (strengths.get(comparison.loserSubmissionId) ?? 1);
      denominator.set(
        comparison.winnerSubmissionId,
        (denominator.get(comparison.winnerSubmissionId) ?? 0) + 1 / total,
      );
      denominator.set(
        comparison.loserSubmissionId,
        (denominator.get(comparison.loserSubmissionId) ?? 0) + 1 / total,
      );
    }
    for (const project of projects) {
      const count = denominator.get(project.submissionId) ?? 0;
      if (count > 0)
        strengths.set(
          project.submissionId,
          Math.max(1e-9, (wins.get(project.submissionId) ?? 0) / count),
        );
    }
  }
  return projects
    .map((project) => ({
      ...project,
      strength: strengths.get(project.submissionId) ?? 0,
    }))
    .sort((a, b) => b.strength - a.strength)
    .map((project) => ({
      ...project,
      winProbabilityAgainstAverage: bradleyTerryProbability(
        project.strength,
        1,
      ),
    }));
}
