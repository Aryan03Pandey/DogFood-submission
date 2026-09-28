import { and, eq, min, max, count, sql } from "drizzle-orm";
import { db } from "../db";
import { judgeAssignments, scores, submissions, users, votes, deriveEventStatus, type DbUser } from "../db/schema";
import { AuthError, getEffectiveRole } from "./auth-service";
import { getEventRow } from "./event-service";
import { getPublishedRankings } from "./judging-service";
import { recordAuditLog } from "./audit-service";
import { signEnvelope, type SignedEnvelope } from "./signing-service";

// Tier 4.6. A judge-record is a *participation attestation*, never a data
// export: it proves "this judge scored N of M assigned submissions for this
// event between these dates," and deliberately carries no rubric scores,
// comments, or submission IDs. Leaking that data into a document a judge
// can hold and show around would break the double-blind/peer-score-isolation
// guarantee the spec weights most heavily (a judge must never see another
// judge's scores) — see CLAUDE.md's note on the peer_scores route.
export async function getJudgeRecord(
  actor: DbUser,
  eventId: string,
  judgeId: string = actor.id,
): Promise<SignedEnvelope> {
  if (actor.id !== judgeId) {
    const role = await getEffectiveRole(actor, eventId);
    if (role !== "SUPERADMIN" && role !== "ORGANIZER") throw new AuthError("FORBIDDEN", 403);
  }

  const [judge] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, judgeId)).limit(1);
  if (!judge) throw new AuthError("JUDGE_NOT_FOUND", 404);

  const [assignmentTotals] = await db
    .select({ assignedCount: count() })
    .from(judgeAssignments)
    .where(and(eq(judgeAssignments.eventId, eventId), eq(judgeAssignments.judgeId, judgeId)));

  const [scoreTotals] = await db
    .select({
      completedCount: count(),
      firstScoredAt: min(scores.submittedAt),
      lastScoredAt: max(scores.submittedAt),
    })
    .from(scores)
    .innerJoin(judgeAssignments, eq(scores.assignmentId, judgeAssignments.id))
    .where(and(eq(judgeAssignments.eventId, eventId), eq(judgeAssignments.judgeId, judgeId)));

  const payload = {
    eventId,
    judgeId,
    judgeName: judge.name,
    assignedCount: assignmentTotals?.assignedCount ?? 0,
    completedCount: scoreTotals?.completedCount ?? 0,
    firstScoredAt: scoreTotals?.firstScoredAt?.toISOString() ?? null,
    lastScoredAt: scoreTotals?.lastScoredAt?.toISOString() ?? null,
  };
  return signEnvelope("judge-record", payload);
}

// Public and unauthenticated once results are PUBLISHED — same spirit as the
// public gallery: results are meant to be independently verifiable by
// anyone, not gated behind a role. Before PUBLISHED, refuses uniformly
// (RESULTS_NOT_PUBLISHED) regardless of caller, so judging data can never
// leak early through this route.
export async function getResultsManifest(eventId: string): Promise<SignedEnvelope> {
  const event = await getEventRow(eventId);
  if (deriveEventStatus(event) !== "PUBLISHED") throw new AuthError("RESULTS_NOT_PUBLISHED", 409);

  const [rankings, voteRows] = await Promise.all([
    getPublishedRankings(eventId),
    db
      .select({ submissionId: votes.submissionId, total: sql<number>`sum(${votes.voteWeight})`.mapWith(Number) })
      .from(votes)
      .innerJoin(submissions, eq(votes.submissionId, submissions.id))
      .where(eq(votes.eventId, eventId))
      .groupBy(votes.submissionId),
  ]);
  const votesBySubmission = new Map(voteRows.map((row) => [row.submissionId, row.total]));

  const payload = {
    eventId,
    eventTitle: event.title,
    generatedAt: new Date().toISOString(),
    rankings: rankings.map((row) => ({
      submissionId: row.submissionId,
      title: row.title,
      teamName: row.teamName,
      scoreCount: row.scoreCount,
      raw: row.raw,
      zScore: row.zScore,
      minMax: row.minMax,
      trimmedMean: row.trimmedMean,
      totalVotes: votesBySubmission.get(row.submissionId) ?? 0,
    })),
  };
  const envelope = await signEnvelope("results-manifest", payload);
  await recordAuditLog({ action: "results_manifest.generated", entityType: "event", entityId: eventId, payloadJson: null });
  return envelope;
}
