import { and, asc, count, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  conflictsOfInterest,
  eventRoles,
  events,
  judgeAssignments,
  judgeTracks,
  pairwiseComparisons,
  rubrics,
  scores,
  submissionFlags,
  submissions,
  teamMembers,
  teams,
  tracks,
  users,
  bradleyTerryProbability,
  weightedMean,
  type DbUser,
  type RubricCriterion,
} from "../db/schema";
import {
  minMaxNormalize,
  rotateOrder,
  trimmedMean,
  zScoreNormalize,
} from "../lib/judging/normalization";
import {
  AuthError,
  assignEventRole,
  getEffectiveRole,
  listUserEventRoles,
  verifyPassword,
} from "./auth-service";
import { recordAuditLog } from "./audit-service";
import { generateAssignments, getRankings } from "./assignment-service";
import { enqueueWebhookEvent } from "./webhook-service";

type Criteria = RubricCriterion[];

// Zod defaults fill kind/step on parse, but parseBody types the input shape,
// so the service accepts the loose form and normalizes before storing.
type LooseCriterion = Omit<RubricCriterion, "kind" | "step"> & {
  kind?: RubricCriterion["kind"];
  step?: number;
};

// Legacy rows (pre-bounds) validate as 0–10 whole numbers so old fixtures
// keep scoring instead of failing the new bounds checks.
function normalizeCriterion(criterion: LooseCriterion): RubricCriterion {
  const step =
    criterion.kind === "float" &&
    typeof criterion.step === "number" &&
    Number.isFinite(criterion.step) &&
    criterion.step >= 0.01 &&
    criterion.step <= 1
      ? criterion.step
      : 1;
  return {
    ...criterion,
    minScore:
      typeof criterion.minScore === "number" && Number.isFinite(criterion.minScore)
        ? criterion.minScore
        : 0,
    maxScore:
      typeof criterion.maxScore === "number" && Number.isFinite(criterion.maxScore)
        ? criterion.maxScore
        : 10,
    kind: criterion.kind === "float" ? "float" : "int",
    step,
  };
}

function criterionAccepts(criterion: RubricCriterion, value: number): boolean {
  const normalized = normalizeCriterion(criterion);
  if (!Number.isFinite(value)) return false;
  if (value < normalized.minScore || value > normalized.maxScore) return false;
  if (normalized.kind === "int" && !Number.isInteger(value)) return false;
  if (normalized.kind === "float") {
    const steps = (value - normalized.minScore) / normalized.step;
    if (Math.abs(steps - Math.round(steps)) > 1e-9) return false;
  }
  return true;
}

async function assertJudge(actor: DbUser, eventId?: string) {
  if (eventId) {
    if ((await getEffectiveRole(actor, eventId)) !== "JUDGE")
      throw new AuthError("FORBIDDEN", 403);
    return;
  }
  if (actor.role === "JUDGE") return;
  const memberships = await listUserEventRoles(actor.id);
  if (!memberships.some((row) => row.role === "JUDGE"))
    throw new AuthError("FORBIDDEN", 403);
}

// Whether the session may see the Judge Dashboard entry point (judge of at
// least one event). UI-only: every judge API re-checks assignment scope.
export async function judgesAnyEvent(user: DbUser): Promise<boolean> {
  const memberships = await listUserEventRoles(user.id);
  return memberships.some((row) => row.role === "JUDGE");
}

export async function getManagedEventIds(
  actor: DbUser,
  eventId?: string,
): Promise<string[]> {
  if (eventId) {
    const role = await getEffectiveRole(actor, eventId);
    if (role !== "SUPERADMIN" && role !== "ORGANIZER")
      throw new AuthError("FORBIDDEN", 403);
    return [eventId];
  }
  if (actor.role === "SUPERADMIN") {
    return (await db.select({ id: events.id }).from(events)).map(
      (row) => row.id,
    );
  }
  const memberships = await db
    .select({ eventId: eventRoles.eventId })
    .from(eventRoles)
    .where(
      and(eq(eventRoles.userId, actor.id), eq(eventRoles.role, "ORGANIZER")),
    );
  if (memberships.length === 0) throw new AuthError("FORBIDDEN", 403);
  return memberships.map((row) => row.eventId);
}

export async function getJudgeQueue(actor: DbUser, eventId?: string) {
  await assertJudge(actor, eventId);
  const filters = [eq(judgeAssignments.judgeId, actor.id)];
  if (eventId) filters.push(eq(judgeAssignments.eventId, eventId));
  const rows = await db
    .select({
      assignmentId: judgeAssignments.id,
      status: judgeAssignments.status,
      eventId: events.id,
      eventTitle: events.title,
      doubleBlind: events.doubleBlindJudging,
      submissionId: submissions.id,
      title: submissions.title,
      tagline: submissions.tagline,
      description: submissions.description,
      techStack: submissions.techStack,
      repoUrl: submissions.repoUrl,
      demoUrl: submissions.demoUrl,
      trackId: tracks.id,
      trackName: tracks.name,
      teamId: teams.id,
      teamName: teams.name,
      scored: scores.id,
      flagId: submissionFlags.id,
      flagReason: submissionFlags.reason,
    })
    .from(judgeAssignments)
    .innerJoin(submissions, eq(judgeAssignments.submissionId, submissions.id))
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .innerJoin(tracks, eq(submissions.trackId, tracks.id))
    .innerJoin(events, eq(judgeAssignments.eventId, events.id))
    .leftJoin(scores, eq(scores.assignmentId, judgeAssignments.id))
    .leftJoin(submissionFlags, eq(submissionFlags.assignmentId, judgeAssignments.id))
    .where(and(...filters))
    .orderBy(asc(events.title), asc(submissions.title));

  return rows.map((row) => ({
    assignmentId: row.assignmentId,
    status: row.status,
    scored: row.scored !== null,
    // A present flag row always carries a reason (NOT NULL); the left join
    // only nulls it when there is no flag.
    flag: row.flagId === null ? null : { id: row.flagId, reason: row.flagReason as string },
    event: { id: row.eventId, title: row.eventTitle },
    submission: {
      id: row.submissionId,
      title: row.title,
      tagline: row.tagline,
      description: row.description,
      techStack: row.techStack ?? [],
      repoUrl: row.repoUrl,
      demoUrl: row.demoUrl,
    },
    track: { id: row.trackId, name: row.trackName },
    ...(!row.doubleBlind
      ? { team: { id: row.teamId, name: row.teamName } }
      : {}),
  }));
}

export async function getAssignedSubmission(
  actor: DbUser,
  submissionId: string,
) {
  const [row] = await db
    .select({
      assignmentId: judgeAssignments.id,
      eventId: events.id,
      eventTitle: events.title,
      doubleBlind: events.doubleBlindJudging,
      submission: submissions,
      track: tracks,
      team: teams,
    })
    .from(judgeAssignments)
    .innerJoin(events, eq(judgeAssignments.eventId, events.id))
    .innerJoin(submissions, eq(judgeAssignments.submissionId, submissions.id))
    .innerJoin(tracks, eq(submissions.trackId, tracks.id))
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .where(
      and(
        eq(judgeAssignments.judgeId, actor.id),
        eq(judgeAssignments.submissionId, submissionId),
      ),
    )
    .limit(1);
  if (!row) throw new AuthError("FORBIDDEN", 403);
  await assertJudge(actor, row.eventId);
  const [rubric] = await db
    .select()
    .from(rubrics)
    .where(eq(rubrics.eventId, row.eventId))
    .limit(1);
  const [ownScore] = await db
    .select()
    .from(scores)
    .where(eq(scores.assignmentId, row.assignmentId))
    .limit(1);
  const [ownFlag] = await db
    .select()
    .from(submissionFlags)
    .where(eq(submissionFlags.assignmentId, row.assignmentId))
    .limit(1);
  const members = row.doubleBlind
    ? []
    : await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: teamMembers.role,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, row.team.id));
  // Blind review strips the team handle too: teamId is a stable identifier
  // for the team even without the team object, so the blind payload is an
  // explicit whitelist matching JudgeDetailPayload.
  const { teamId: _blindedTeamId, ...blindSubmission } = row.submission;
  return {
    assignmentId: row.assignmentId,
    event: {
      id: row.eventId,
      title: row.eventTitle,
      doubleBlindJudging: row.doubleBlind,
    },
    submission: row.doubleBlind ? blindSubmission : row.submission,
    track: row.track,
    rubric: rubric ?? null,
    score: ownScore
      ? {
          rubricScoresJson: ownScore.rubricScoresJson,
          comment: ownScore.comment,
          submittedAt: ownScore.submittedAt?.toISOString() ?? null,
        }
      : null,
    flag: ownFlag
      ? { id: ownFlag.id, reason: ownFlag.reason, comment: ownFlag.comment }
      : null,
    ...(!row.doubleBlind ? { team: { ...row.team, members } } : {}),
  };
}

export async function getJudgeScores(
  actor: DbUser,
  targetJudgeId = actor.id,
  eventId?: string,
) {
  if (targetJudgeId === actor.id) {
    await assertJudge(actor, eventId);
  } else {
    const managedEvents = await getManagedEventIds(actor, eventId);
    const targetAssignments = await db
      .select({ eventId: judgeAssignments.eventId })
      .from(judgeAssignments)
      .where(eq(judgeAssignments.judgeId, targetJudgeId));
    if (!targetAssignments.some((row) => managedEvents.includes(row.eventId))) {
      throw new AuthError("FORBIDDEN", 403);
    }
  }
  const filters = [eq(scores.judgeId, targetJudgeId)];
  if (eventId) filters.push(eq(judgeAssignments.eventId, eventId));
  return db
    .select({
      id: scores.id,
      assignmentId: scores.assignmentId,
      judgeId: scores.judgeId,
      submissionId: scores.submissionId,
      rubricScoresJson: scores.rubricScoresJson,
      rawTotal: scores.rawTotal,
      comment: scores.comment,
      submittedAt: scores.submittedAt,
      eventId: judgeAssignments.eventId,
    })
    .from(scores)
    .innerJoin(judgeAssignments, eq(scores.assignmentId, judgeAssignments.id))
    .where(and(...filters));
}

export async function saveJudgeScore(
  actor: DbUser,
  input: {
    assignmentId: string;
    rubricScoresJson: Record<string, number>;
    comment?: string;
  },
) {
  const [assignment] = await db
    .select({
      eventId: judgeAssignments.eventId,
      judgeId: judgeAssignments.judgeId,
      submissionId: judgeAssignments.submissionId,
    })
    .from(judgeAssignments)
    .where(eq(judgeAssignments.id, input.assignmentId))
    .limit(1);
  if (!assignment || assignment.judgeId !== actor.id)
    throw new AuthError("FORBIDDEN", 403);
  await assertJudge(actor, assignment.eventId);
  const [rubric] = await db
    .select()
    .from(rubrics)
    .where(eq(rubrics.eventId, assignment.eventId))
    .limit(1);
  if (!rubric) throw new AuthError("RUBRIC_NOT_FOUND", 409);
  const criteria = rubric.criteriaJson as Criteria;
  const criterionIds = new Set(criteria.map((criterion) => criterion.id));
  if (
    criteria.some(
      (criterion) => !criterionAccepts(criterion, input.rubricScoresJson[criterion.id]),
    ) ||
    Object.keys(input.rubricScoresJson).some((id) => !criterionIds.has(id))
  ) {
    throw new AuthError("INVALID_RUBRIC_SCORES", 400);
  }
  const rawTotal = weightedMean(input.rubricScoresJson, criteria);
  const [score] = await db
    .insert(scores)
    .values({
      assignmentId: input.assignmentId,
      judgeId: actor.id,
      submissionId: assignment.submissionId,
      rubricScoresJson: input.rubricScoresJson,
      rawTotal,
      comment: input.comment?.trim() || null,
    })
    .onConflictDoUpdate({
      target: scores.assignmentId,
      set: {
        rubricScoresJson: input.rubricScoresJson,
        rawTotal,
        comment: input.comment?.trim() || null,
        submittedAt: new Date(),
      },
    })
    .returning();
  await db
    .update(judgeAssignments)
    .set({ status: "DONE" })
    .where(eq(judgeAssignments.id, input.assignmentId));

  await recordAuditLog({
    actorId: actor.id,
    action: 'SCORE_SUBMITTED',
    entityType: 'ASSIGNMENT',
    entityId: input.assignmentId,
    payloadJson: {
      submissionId: assignment.submissionId,
      rawTotal,
      rubricScores: input.rubricScoresJson,
    },
  });

  // judging.completed has no stored flag — recomputed on every score save.
  // The partial unique index on webhook_deliveries (endpointId, eventId,
  // eventType) is what actually prevents this from re-firing on every
  // subsequent save once the event is already fully scored; this check is
  // just an optimization to skip the enqueue attempt in the common case.
  const [totals] = await db
    .select({ assigned: count(), completed: count(sql`case when ${judgeAssignments.status} = 'DONE' then 1 end`) })
    .from(judgeAssignments)
    .where(eq(judgeAssignments.eventId, assignment.eventId));
  if (totals && totals.assigned > 0 && totals.assigned === totals.completed) {
    await enqueueWebhookEvent(assignment.eventId, "judging.completed", { eventId: assignment.eventId });
  }

  return score;
}

// Score clearing (judge dashboard Clear action): deletes the judge's saved
// score for their own assignment and reopens it to PENDING. Clearing a
// never-scored assignment is a no-op success. Same ownership checks as save.
export async function clearScore(actor: DbUser, assignmentId: string) {
  const [assignment] = await db
    .select({
      eventId: judgeAssignments.eventId,
      judgeId: judgeAssignments.judgeId,
    })
    .from(judgeAssignments)
    .where(eq(judgeAssignments.id, assignmentId))
    .limit(1);
  if (!assignment || assignment.judgeId !== actor.id)
    throw new AuthError("FORBIDDEN", 403);
  await assertJudge(actor, assignment.eventId);
  await db.transaction(async (tx) => {
    await tx.delete(scores).where(eq(scores.assignmentId, assignmentId));
    await tx
      .update(judgeAssignments)
      .set({ status: "PENDING" })
      .where(eq(judgeAssignments.id, assignmentId));
  });
  await recordAuditLog({
    actorId: actor.id,
    action: 'SCORE_CLEARED',
    entityType: 'ASSIGNMENT',
    entityId: assignmentId,
  });
  return { assignmentId, cleared: true };
}

// Flagging (judge dashboard Flag action): one live flag per assignment,
// reporter-private. Reason comes from the fixed enum; comment is optional.
export async function flagSubmission(
  actor: DbUser,
  input: { assignmentId: string; reason: string; comment?: string },
) {
  const [assignment] = await db
    .select({
      eventId: judgeAssignments.eventId,
      judgeId: judgeAssignments.judgeId,
      submissionId: judgeAssignments.submissionId,
    })
    .from(judgeAssignments)
    .where(eq(judgeAssignments.id, input.assignmentId))
    .limit(1);
  if (!assignment || assignment.judgeId !== actor.id)
    throw new AuthError("FORBIDDEN", 403);
  await assertJudge(actor, assignment.eventId);
  const [flag] = await db
    .insert(submissionFlags)
    .values({
      assignmentId: input.assignmentId,
      judgeId: actor.id,
      submissionId: assignment.submissionId,
      reason: input.reason as typeof submissionFlags.$inferInsert.reason,
      comment: input.comment?.trim() || null,
    })
    .onConflictDoUpdate({
      target: submissionFlags.assignmentId,
      set: {
        reason: input.reason as typeof submissionFlags.$inferInsert.reason,
        comment: input.comment?.trim() || null,
      },
    })
    .returning();
  await recordAuditLog({
    actorId: actor.id,
    action: 'FLAG_ADDED',
    entityType: 'ASSIGNMENT',
    entityId: input.assignmentId,
    payloadJson: { submissionId: assignment.submissionId, reason: input.reason },
  });
  return flag;
}

export async function unflagSubmission(actor: DbUser, assignmentId: string) {
  const [assignment] = await db
    .select({
      eventId: judgeAssignments.eventId,
      judgeId: judgeAssignments.judgeId,
    })
    .from(judgeAssignments)
    .where(eq(judgeAssignments.id, assignmentId))
    .limit(1);
  if (!assignment || assignment.judgeId !== actor.id)
    throw new AuthError("FORBIDDEN", 403);
  await assertJudge(actor, assignment.eventId);
  await db
    .delete(submissionFlags)
    .where(eq(submissionFlags.assignmentId, assignmentId));
  await recordAuditLog({
    actorId: actor.id,
    action: 'FLAG_CLEARED',
    entityType: 'ASSIGNMENT',
    entityId: assignmentId,
  });
  return { assignmentId, cleared: true };
}

export async function inviteJudge(
  actor: DbUser,
  eventId: string,
  userId: string,
) {
  // A participant of the same event can never be added as a judge (not even
  // by overwriting their PARTICIPANT mapping).
  const [existing] = await db
    .select({ role: eventRoles.role })
    .from(eventRoles)
    .where(and(eq(eventRoles.eventId, eventId), eq(eventRoles.userId, userId)))
    .limit(1);
  if (existing && existing.role === "PARTICIPANT")
    throw new AuthError("PARTICIPANT_IS_JUDGE", 409);
  return assignEventRole({
    actor,
    eventId,
    targetUserId: userId,
    role: "JUDGE",
  });
}

// Event judges with their qualified track names for the organizer UI.
export async function getEventJudges(actor: DbUser, eventId: string) {
  await assertOrganizer(actor, eventId);
  const judges = await db
    .select({ id: users.id, name: users.name, email: users.email, organization: users.organization })
    .from(eventRoles)
    .innerJoin(users, eq(eventRoles.userId, users.id))
    .where(and(eq(eventRoles.eventId, eventId), eq(eventRoles.role, "JUDGE")))
    .orderBy(asc(users.email));
  const trackRows = await db
    .select({ judgeId: judgeTracks.judgeId, trackId: tracks.id, trackName: tracks.name })
    .from(judgeTracks)
    .innerJoin(tracks, eq(judgeTracks.trackId, tracks.id))
    .where(eq(tracks.eventId, eventId));
  return judges.map((judge) => ({
    ...judge,
    tracks: trackRows.filter((row) => row.judgeId === judge.id),
  }));
}

export async function getRubric(actor: DbUser, eventId: string) {
  await assertOrganizer(actor, eventId);
  const [rubric] = await db
    .select()
    .from(rubrics)
    .where(eq(rubrics.eventId, eventId))
    .limit(1);
  return rubric ?? null;
}

// Judge candidate search for the organizer UI: all users with their current
// event role (null when uninvolved), so the UI can hide same-event
// participants and label existing judges. Organizer-only.
export async function listJudgeCandidates(
  actor: DbUser,
  eventId: string,
  query?: string,
) {
  await assertOrganizer(actor, eventId);
  const needle = query?.trim().toLowerCase() ?? "";
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      organization: users.organization,
      eventRole: eventRoles.role,
    })
    .from(users)
    .leftJoin(
      eventRoles,
      and(eq(eventRoles.userId, users.id), eq(eventRoles.eventId, eventId)),
    )
    .limit(200);
  return rows
    .filter((row) => {
      if (needle === "") return true;
      return (
        row.email.toLowerCase().includes(needle) ||
        (row.name ?? "").toLowerCase().includes(needle) ||
        (row.organization ?? "").toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => a.email.localeCompare(b.email));
}

// Judge removal: organizer-only, password-confirmed. Drops the role, the
// judge's assignments (scores and flags cascade), and their conflicts, then
// regenerates the orphaned coverage with the event's selected algorithm so
// no submission loses reviewers.
export async function removeJudge(
  actor: DbUser,
  eventId: string,
  judgeId: string,
  password: string,
) {
  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) throw new AuthError("EVENT_NOT_FOUND", 404);
  await assertOrganizer(actor, eventId);
  if (!(await verifyPassword(actor.passwordHash, password)))
    throw new AuthError("INVALID_CREDENTIALS", 401);
  const [mapping] = await db
    .select({ id: eventRoles.id })
    .from(eventRoles)
    .where(
      and(
        eq(eventRoles.eventId, eventId),
        eq(eventRoles.userId, judgeId),
        eq(eventRoles.role, "JUDGE"),
      ),
    )
    .limit(1);
  if (!mapping) throw new AuthError("JUDGE_NOT_FOUND", 404);
  const orphans = await db
    .select({ submissionId: judgeAssignments.submissionId })
    .from(judgeAssignments)
    .where(
      and(
        eq(judgeAssignments.eventId, eventId),
        eq(judgeAssignments.judgeId, judgeId),
      ),
    );
  await db.transaction(async (tx) => {
    await tx
      .delete(conflictsOfInterest)
      .where(
        and(
          eq(conflictsOfInterest.eventId, eventId),
          eq(conflictsOfInterest.judgeId, judgeId),
        ),
      );
    await tx
      .delete(judgeAssignments)
      .where(
        and(
          eq(judgeAssignments.eventId, eventId),
          eq(judgeAssignments.judgeId, judgeId),
        ),
      );
    await tx.delete(eventRoles).where(eq(eventRoles.id, mapping.id));
  });
  const regen = await generateAssignments(actor, eventId);
  return {
    removed: true,
    orphaned: orphans.length,
    reassigned: regen.assignmentsCreated,
    unresolved: regen.unresolved,
  };
}

export async function setJudgeTracks(
  actor: DbUser,
  eventId: string,
  judgeId: string,
  trackIds: string[],
) {
  await assertOrganizer(actor, eventId);
  const [judgeRole] = await db
    .select({ id: eventRoles.id })
    .from(eventRoles)
    .where(
      and(
        eq(eventRoles.eventId, eventId),
        eq(eventRoles.userId, judgeId),
        eq(eventRoles.role, "JUDGE"),
      ),
    )
    .limit(1);
  if (!judgeRole) throw new AuthError("JUDGE_NOT_FOUND", 404);
  const eventTracks = await db
    .select({ id: tracks.id })
    .from(tracks)
    .where(eq(tracks.eventId, eventId));
  const validTracks = new Set(eventTracks.map((track) => track.id));
  if (trackIds.some((trackId) => !validTracks.has(trackId)))
    throw new AuthError("TRACK_NOT_FOUND", 404);
  const eventTrackIds = [...validTracks];
  if (eventTrackIds.length > 0) {
    await db
      .delete(judgeTracks)
      .where(
        and(
          eq(judgeTracks.judgeId, judgeId),
          inArray(judgeTracks.trackId, eventTrackIds),
        ),
      );
  }
  if (trackIds.length > 0)
    await db
      .insert(judgeTracks)
      .values(trackIds.map((trackId) => ({ judgeId, trackId })));
  return { judgeId, trackIds };
}

export async function addManualConflict(
  actor: DbUser,
  input: { eventId: string; judgeId: string; teamId: string },
) {
  await assertOrganizer(actor, input.eventId);
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.id, input.teamId), eq(teams.eventId, input.eventId)))
    .limit(1);
  const [judge] = await db
    .select({ id: eventRoles.id })
    .from(eventRoles)
    .where(
      and(
        eq(eventRoles.eventId, input.eventId),
        eq(eventRoles.userId, input.judgeId),
        eq(eventRoles.role, "JUDGE"),
      ),
    )
    .limit(1);
  if (!team) throw new AuthError("TEAM_NOT_FOUND", 404);
  if (!judge) throw new AuthError("JUDGE_NOT_FOUND", 404);
  const [row] = await db
    .insert(conflictsOfInterest)
    .values({ ...input, reason: "manual" })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const [existing] = await db
    .select()
    .from(conflictsOfInterest)
    .where(
      and(
        eq(conflictsOfInterest.judgeId, input.judgeId),
        eq(conflictsOfInterest.teamId, input.teamId),
      ),
    )
    .limit(1);
  await recordAuditLog({
    actorId: actor.id,
    action: 'COI_MANUAL_ADDED',
    entityType: 'EVENT',
    entityId: input.eventId,
    payloadJson: { judgeId: input.judgeId, teamId: input.teamId, reason: 'manual' },
  });

  return existing;
}

export async function saveRubric(
  actor: DbUser,
  input: {
    eventId: string;
    id?: string;
    title: string;
    criteriaJson: LooseCriterion[];
  },
) {
  await assertOrganizer(actor, input.eventId);
  const criteria = input.criteriaJson.map(normalizeCriterion);
  const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  const ids = criteria.map((criterion) => criterion.id);
  if (
    criteria.length === 0 ||
    new Set(ids).size !== ids.length ||
    criteria.some(
      (criterion) =>
        criterion.weight < 0 ||
        !(criterion.maxScore > criterion.minScore) ||
        (criterion.kind === "int" && criterion.step !== 1),
    ) ||
    totalWeight <= 0
  ) {
    throw new AuthError("INVALID_RUBRIC", 400);
  }
  if (input.id) {
    const [updated] = await db
      .update(rubrics)
      .set({ title: input.title, criteriaJson: criteria })
      .where(and(eq(rubrics.id, input.id), eq(rubrics.eventId, input.eventId)))
      .returning();
    if (!updated) throw new AuthError("RUBRIC_NOT_FOUND", 404);
    return updated;
  }
  await recordAuditLog({
    actorId: actor.id,
    action: 'RUBRIC_CREATED',
    entityType: 'EVENT',
    entityId: input.eventId,
    payloadJson: { title: input.title, criteria: input.criteriaJson },
  });
  const [created] = await db
    .insert(rubrics)
    .values({ eventId: input.eventId, title: input.title, criteriaJson: criteria })
    .returning();
  return created;
}

export interface CsvRow {
  assignmentRowId: string;
  eventId: string;
  eventTitle: string;
  normalization: string;
  submissionId: string;
  submissionTitle: string;
  teamName: string;
  judgeId: string;
  judgeName: string | null;
  assignmentStatus: string;
  rawTotal: number | null;
  flagReason: string | null;
  ranking:
    | {
        raw: number;
        zScore: number;
        minMax: number;
        trimmedMean: number;
        scoreCount: number;
      }
    | undefined;
}

// Memory-efficient CSV source: yields one batch at a time using keyset
// pagination over the assignment id, so the route can stream million-row
// exports without materializing them. Per-event numeric rankings are still
// computed once each (small numbers, not wide rows).
export async function* streamCsvRows(
  actor: DbUser,
  eventId?: string,
  batchSize = 500,
): AsyncGenerator<CsvRow[]> {
  const eventIds = await getManagedEventIds(actor, eventId);
  const rankings = new Map<string, Map<string, NonNullable<CsvRow["ranking"]>>>();
  for (const id of eventIds) {
    const list = await getRankings(actor, id);
    rankings.set(
      id,
      new Map(
        list.map((entry) => [
          entry.submissionId,
          {
            raw: entry.raw,
            zScore: entry.zScore,
            minMax: entry.minMax,
            trimmedMean: entry.trimmedMean,
            scoreCount: entry.scoreCount,
          },
        ]),
      ),
    );
  }
  for (const id of eventIds) {
    let cursor: string | undefined;
    while (true) {
      const batch = await db
        .select({
          assignmentRowId: judgeAssignments.id,
          eventId: events.id,
          eventTitle: events.title,
          normalization: events.normalization,
          submissionId: submissions.id,
          submissionTitle: submissions.title,
          teamName: teams.name,
          judgeId: users.id,
          judgeName: users.name,
          assignmentStatus: judgeAssignments.status,
          rawTotal: scores.rawTotal,
          flagReason: submissionFlags.reason,
        })
        .from(judgeAssignments)
        .innerJoin(events, eq(judgeAssignments.eventId, events.id))
        .innerJoin(submissions, eq(judgeAssignments.submissionId, submissions.id))
        .innerJoin(teams, eq(submissions.teamId, teams.id))
        .innerJoin(users, eq(judgeAssignments.judgeId, users.id))
        .leftJoin(scores, eq(scores.assignmentId, judgeAssignments.id))
        .leftJoin(
          submissionFlags,
          eq(submissionFlags.assignmentId, judgeAssignments.id),
        )
        .where(
          and(
            eq(judgeAssignments.eventId, id),
            cursor === undefined ? undefined : gt(judgeAssignments.id, cursor),
          ),
        )
        .orderBy(asc(judgeAssignments.id))
        .limit(batchSize);
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].assignmentRowId;
      const bySubmission = rankings.get(id);
      yield batch.map((row) => ({
        ...row,
        ranking: bySubmission?.get(row.submissionId),
      }));
    }
  }
}

export async function submitPairwiseComparison(
  actor: DbUser,
  input: { winnerSubmissionId: string; loserSubmissionId: string },
) {
  if (input.winnerSubmissionId === input.loserSubmissionId)
    throw new AuthError("INVALID_COMPARISON", 400);
  const assignments = await db
    .select({
      eventId: judgeAssignments.eventId,
      submissionId: judgeAssignments.submissionId,
    })
    .from(judgeAssignments)
    .where(
      and(
        eq(judgeAssignments.judgeId, actor.id),
        inArray(judgeAssignments.submissionId, [
          input.winnerSubmissionId,
          input.loserSubmissionId,
        ]),
      ),
    );
  const winner = assignments.find(
    (row) => row.submissionId === input.winnerSubmissionId,
  );
  const loser = assignments.find(
    (row) => row.submissionId === input.loserSubmissionId,
  );
  if (!winner || !loser || winner.eventId !== loser.eventId)
    throw new AuthError("FORBIDDEN", 403);
  await assertJudge(actor, winner.eventId);
  const [row] = await db
    .insert(pairwiseComparisons)
    .values({ eventId: winner.eventId, judgeId: actor.id, ...input })
    .returning();
  return row;
}

async function assertOrganizer(actor: DbUser, eventId: string) {
  const role = await getEffectiveRole(actor, eventId);
  if (role !== "SUPERADMIN" && role !== "ORGANIZER")
    throw new AuthError("FORBIDDEN", 403);
}
