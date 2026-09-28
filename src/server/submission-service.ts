import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  canEditSubmission,
  deriveEventStatus,
  events,
  generateInviteToken,
  submissions,
  teamMembers,
  teams,
  tracks,
  type DbUser,
} from "../db/schema";
import { AuthError, getEventRole, verifyPassword } from "./auth-service";
import { getEventRow } from "./event-service";
import { hashInviteToken } from "../lib/auth";
import { inviteExpiryFrom } from "../lib/teams";
import {
  normalizeSubmissionAssets,
  SUBMISSION_ASSET_MIME,
  SUBMISSION_ASSET_TOTAL_BYTES,
  submissionAssetOverflow,
  submissionAssetsSize,
  type SubmissionAsset,
} from "../lib/submissions";
import type {
  CreateSubmissionRequest,
  UpdateSubmissionRequest,
} from "../lib/api/schemas";

// Team submissions (SUBMISSIONS.md). Members own the draft; the leader owns
// finalize and delete. Every write runs inside the submission window — the
// server clock decides, never the client.

export interface SubmissionSummary {
  id: string;
  teamId: string;
  eventId: string;
  trackId: string | null;
  trackName: string;
  title: string;
  tagline: string | null;
  description: string | null;
  techStack: string[];
  repoUrl: string | null;
  demoUrl: string | null;
  assets: SubmissionAsset[];
  assetBytes: number;
  status: "draft" | "final";
  submittedAt: string | null;
  updatedAt: string;
  isLeader: boolean;
}

function serialize(
  row: typeof submissions.$inferSelect,
  trackName: string,
  actorId: string,
  role: "LEADER" | "MEMBER",
): SubmissionSummary {
  const assets = normalizeSubmissionAssets(row.assetKeys);
  return {
    id: row.id,
    teamId: row.teamId,
    eventId: "",
    trackId: row.trackId,
    trackName,
    title: row.title,
    tagline: row.tagline,
    description: row.description,
    techStack: row.techStack ?? [],
    repoUrl: row.repoUrl,
    demoUrl: row.demoUrl,
    assets,
    assetBytes: submissionAssetsSize(assets),
    status: row.isDraft ? "draft" : "final",
    submittedAt: row.submittedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    isLeader: role === "LEADER",
  };
}

// Writes are allowed only inside the submission window. Past the deadline
// everything 403s as SUBMISSION_CLOSED; anywhere else (including DRAFT
// events) 403s as SUBMISSION_NOT_OPEN.
export function assertSubmissionWindow(
  event: {
    status: string;
    registrationEnd?: Date | null;
    submissionStart?: Date | null;
    submissionDeadline?: Date | null;
    judgingStart?: Date | null;
    judgingEndTime?: Date | null;
    publicVotingStart?: Date | null;
    publicVotingEndTime?: Date | null;
  },
  now: Date = new Date(),
): void {
  if (deriveEventStatus(event as Parameters<typeof deriveEventStatus>[0], now) === "SUBMISSION") {
    return;
  }
  if (!canEditSubmission({ submissionDeadline: event.submissionDeadline ?? null }, now)) {
    throw new AuthError("SUBMISSION_CLOSED", 403);
  }
  throw new AuthError("SUBMISSION_NOT_OPEN", 403);
}

async function teamIdFor(userId: string, eventId: string): Promise<string | null> {
  const rows = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(eq(teams.eventId, eventId), eq(teamMembers.userId, userId)))
    .limit(1);
  return rows[0]?.teamId ?? null;
}

async function requireSubmissionAccess(actor: DbUser, eventId: string, submissionId: string) {
  const [submission] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1);
  if (!submission) throw new AuthError("SUBMISSION_NOT_FOUND", 404);
  const [team] = await db.select().from(teams).where(eq(teams.id, submission.teamId)).limit(1);
  if (!team || team.eventId !== eventId) throw new AuthError("SUBMISSION_NOT_FOUND", 404);
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new AuthError("EVENT_NOT_FOUND", 404);
  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, actor.id)))
    .limit(1);
  if (!membership) throw new AuthError("NOT_IN_TEAM", 404);
  const [track] = submission.trackId
    ? await db.select().from(tracks).where(eq(tracks.id, submission.trackId)).limit(1)
    : [];
  return { submission, team, event, role: membership.role, trackName: track?.name ?? "" };
}

function emptyToNull(value: string | null | undefined): string | null {
  return value == null || value === "" ? null : value;
}

// Own-team submission read for the submit page. Null when there is nothing
// to show yet (the page offers a bare Start draft button instead).
export async function getMySubmission(
  actor: DbUser,
  eventId: string,
): Promise<SubmissionSummary | null> {
  const teamId = await teamIdFor(actor.id, eventId);
  if (!teamId) return null;
  const [submission] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.teamId, teamId))
    .limit(1);
  if (!submission) return null;
  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actor.id)))
    .limit(1);
  if (!membership) return null;
  const [track] = submission.trackId
    ? await db.select().from(tracks).where(eq(tracks.id, submission.trackId)).limit(1)
    : [];
  const summary = serialize(submission, track?.name ?? "", actor.id, membership.role);
  summary.eventId = eventId;
  return summary;
}

// Draft creation (idempotent per team): staff mappings cannot submit, TEAM
// events need a team first, INDIVIDUAL events get a solo team provisioned so
// submissions.teamId stays NOT NULL without a migration.
export async function createDraft(
  actor: DbUser,
  eventId: string,
  input: CreateSubmissionRequest,
  now: Date = new Date(),
): Promise<SubmissionSummary> {
  const event = await getEventRow(eventId);
  const mapping = await getEventRole(actor.id, eventId);
  if (mapping !== "PARTICIPANT") throw new AuthError("NOT_REGISTERED", 403);
  assertSubmissionWindow(event, now);
  // Drafts start trackless; the team picks a track in the form (PATCH) and
  // finalize refuses trackless drafts. A supplied id must belong to the event.
  let inputTrackName = "";
  if (input.trackId !== undefined) {
    const [track] = await db
      .select()
      .from(tracks)
      .where(and(eq(tracks.id, input.trackId), eq(tracks.eventId, eventId)))
      .limit(1);
    if (!track) throw new AuthError("TRACK_NOT_FOUND", 404);
    inputTrackName = track.name;
  }
  let teamId = await teamIdFor(actor.id, eventId);
  let role: "LEADER" | "MEMBER" = "MEMBER";
  if (!teamId) {
    if (event.participationType !== "INDIVIDUAL") throw new AuthError("TEAM_REQUIRED", 409);
    const token = generateInviteToken();
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(teams)
        .values({
          eventId,
          name: actor.name ?? actor.email,
          inviteCodeHash: hashInviteToken(token),
          inviteExpiresAt: inviteExpiryFrom(now),
          isLocked: false,
        })
        .returning();
      await tx.insert(teamMembers).values({ teamId: row.id, userId: actor.id, role: "LEADER" });
      return row;
    });
    teamId = created.id;
    role = "LEADER";
  } else {
    const [membership] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actor.id)))
      .limit(1);
    if (!membership) throw new AuthError("NOT_IN_TEAM", 404);
    role = membership.role;
  }
  const [existing] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.teamId, teamId))
    .limit(1);
  if (existing) {
    const [existingTrack] = existing.trackId
      ? await db.select().from(tracks).where(eq(tracks.id, existing.trackId)).limit(1)
      : [];
    const summary = serialize(existing, existingTrack?.name ?? "", actor.id, role);
    summary.eventId = eventId;
    return summary;
  }
  const [row] = await db
    .insert(submissions)
    .values({ teamId, trackId: input.trackId ?? null, title: "Untitled project" })
    .returning();
  const summary = serialize(row, inputTrackName, actor.id, role);
  summary.eventId = eventId;
  return summary;
}

// Explicit-save target (Save draft button). The updatedAt precondition is
// the whole conflict protocol: a teammate who saved first makes this 409
// STALE_DRAFT and the UI refetches instead of overwriting.
export async function updateDraft(
  actor: DbUser,
  eventId: string,
  submissionId: string,
  input: UpdateSubmissionRequest,
  now: Date = new Date(),
): Promise<SubmissionSummary> {
  const { submission, event, role, trackName } = await requireSubmissionAccess(
    actor,
    eventId,
    submissionId,
  );
  assertSubmissionWindow(event, now);
  if (!submission.isDraft) throw new AuthError("ALREADY_SUBMITTED", 409);
  if (new Date(input.updatedAt).getTime() !== submission.updatedAt.getTime()) {
    throw new AuthError("STALE_DRAFT", 409);
  }
  let nextTrackName = trackName;
  if (input.trackId !== undefined && input.trackId !== submission.trackId) {
    const [track] = await db
      .select()
      .from(tracks)
      .where(and(eq(tracks.id, input.trackId), eq(tracks.eventId, eventId)))
      .limit(1);
    if (!track) throw new AuthError("TRACK_NOT_FOUND", 404);
    nextTrackName = track.name;
  }
  const [updated] = await db
    .update(submissions)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.tagline !== undefined ? { tagline: emptyToNull(input.tagline) } : {}),
      ...(input.description !== undefined ? { description: emptyToNull(input.description) } : {}),
      ...(input.techStack !== undefined
        ? { techStack: input.techStack.map((entry) => entry.trim()).filter((entry) => entry !== "") }
        : {}),
      ...(input.trackId !== undefined ? { trackId: input.trackId } : {}),
      ...(input.repoUrl !== undefined ? { repoUrl: emptyToNull(input.repoUrl) } : {}),
      ...(input.demoUrl !== undefined ? { demoUrl: emptyToNull(input.demoUrl) } : {}),
      updatedAt: now,
    })
    .where(eq(submissions.id, submissionId))
    .returning();
  const summary = serialize(updated, nextTrackName, actor.id, role);
  summary.eventId = eventId;
  return summary;
}

// Records one already-stored asset key against the draft after the route
// forwards the bytes to seaweedfs. Only the total cap is enforced — a
// single file may use the whole budget.
export async function appendAsset(
  actor: DbUser,
  eventId: string,
  submissionId: string,
  asset: SubmissionAsset,
  now: Date = new Date(),
): Promise<{ summary: SubmissionSummary; usedBytes: number; totalBytes: number }> {
  const { submission, event, role, trackName } = await requireSubmissionAccess(
    actor,
    eventId,
    submissionId,
  );
  // eslint-disable-next-line no-console
  console.log('[asset-upload] appendAsset: user =', actor.email, ', key =', asset.key, `${asset.sizeBytes}B`, asset.mime, ', existing =', normalizeSubmissionAssets(submission.assetKeys).length, ', isDraft =', submission.isDraft);
  assertSubmissionWindow(event, now);
  if (!submission.isDraft) throw new AuthError("ALREADY_SUBMITTED", 409);
  if (!(SUBMISSION_ASSET_MIME as readonly string[]).includes(asset.mime)) {
    throw new AuthError("UNSUPPORTED_TYPE", 400);
  }
  const existing = normalizeSubmissionAssets(submission.assetKeys);
  const overflow = submissionAssetOverflow(existing, asset.sizeBytes);
  if (overflow !== null) throw new AuthError("ASSET_BUDGET_EXCEEDED", 413);
  const [updated] = await db
    .update(submissions)
    .set({ assetKeys: [...existing, asset], updatedAt: now })
    .where(eq(submissions.id, submissionId))
    .returning();
  const summary = serialize(updated, trackName, actor.id, role);
  summary.eventId = eventId;
  return { summary, usedBytes: summary.assetBytes, totalBytes: SUBMISSION_ASSET_TOTAL_BYTES };
}

// Removes one asset key from the draft (any member: draft edits are not
// leader-only). Draft-only and inside the submission window; the updatedAt
// bump keeps the stale-draft protocol honest. Returns the key so the route
// can best-effort remove the bytes from seaweedfs.
export async function removeAsset(
  actor: DbUser,
  eventId: string,
  submissionId: string,
  key: string,
  now: Date = new Date(),
): Promise<SubmissionSummary> {
  const { submission, event, role, trackName } = await requireSubmissionAccess(
    actor,
    eventId,
    submissionId,
  );
  assertSubmissionWindow(event, now);
  if (!submission.isDraft) throw new AuthError("ALREADY_SUBMITTED", 409);
  const existing = normalizeSubmissionAssets(submission.assetKeys);
  if (!existing.some((asset) => asset.key === key)) throw new AuthError("ASSET_NOT_FOUND", 404);
  const [updated] = await db
    .update(submissions)
    .set({
      assetKeys: existing.filter((asset) => asset.key !== key),
      updatedAt: now,
    })
    .where(eq(submissions.id, submissionId))
    .returning();
  const summary = serialize(updated, trackName, actor.id, role);
  summary.eventId = eventId;
  return summary;
}

// Draft-only, leader-only, password-confirmed delete. Finalized submissions
// and post-deadline rows are never deletable; seaweedfs keys are returned
// so the route can best-effort remove the bytes.
export async function deleteDraft(
  actor: DbUser,
  eventId: string,
  submissionId: string,
  password: string,
  now: Date = new Date(),
): Promise<{ submissionId: string; deleted: boolean; assetKeys: string[] }> {
  const { submission, event, role } = await requireSubmissionAccess(
    actor,
    eventId,
    submissionId,
  );
  if (role !== "LEADER") throw new AuthError("FORBIDDEN", 403);
  if (!(await verifyPassword(actor.passwordHash, password))) {
    throw new AuthError("INVALID_CREDENTIALS", 401);
  }
  assertSubmissionWindow(event, now);
  if (!submission.isDraft) throw new AuthError("ALREADY_SUBMITTED", 409);
  const assets = normalizeSubmissionAssets(submission.assetKeys);
  await db.delete(submissions).where(eq(submissions.id, submissionId));
  return { submissionId, deleted: true, assetKeys: assets.map((asset) => asset.key) };
}
