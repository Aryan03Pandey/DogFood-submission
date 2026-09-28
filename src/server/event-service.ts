import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  canChangePrize,
  canEditEventConfig,
  canRegister,
  deriveEventStatus,
  eventRoles,
  events,
  prizes,
  submissions,
  teamMembers,
  teams,
  tracks,
  type DbEvent,
  type DbUser,
} from '../db/schema'
import { AuthError, getEffectiveRole, getEventRole, listUserEventRoles, verifyPassword } from './auth-service'
import { sanitizeDescriptionHtml } from '../lib/sanitize'
import { hasCompleteProfile } from '../lib/profile'
import type {
  CreateEventRequest,
  CreatePrizeRequest,
  CreateTrackRequest,
  UpdateEventRequest,
  UpdatePrizeRequest,
  UpdateTrackRequest,
} from "../lib/api/schemas";
import { recordAuditLog } from "./audit-service";

// Organizer event management. Every mutating call resolves the effective
// phase with deriveEventStatus (server clock) and enforces it before
// touching the database; the prize-floor trigger (0004) remains the
// backstop for direct writes that bypass this layer.
export function serializeEvent(row: DbEvent) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: deriveEventStatus(row),
    registrationEnd: row.registrationEnd?.toISOString() ?? null,
    submissionStart: row.submissionStart?.toISOString() ?? null,
    submissionDeadline: row.submissionDeadline?.toISOString() ?? null,
    judgingStart: row.judgingStart?.toISOString() ?? null,
    judgingEndTime: row.judgingEndTime?.toISOString() ?? null,
    publicVotingStart: row.publicVotingStart?.toISOString() ?? null,
    publicVotingEndTime: row.publicVotingEndTime?.toISOString() ?? null,
    announcementDate: row.announcementDate?.toISOString() ?? null,
    judgesPerSubmission: row.judgesPerSubmission,
    doubleBlindJudging: row.doubleBlindJudging,
    assignmentAlgorithm: row.assignmentAlgorithm,
    normalization: row.normalization,
    logoUrl: row.logoUrl,
    bannerUrl: row.bannerUrl,
    cardBannerUrl: row.cardBannerUrl,
    websiteUrl: row.websiteUrl,
    descriptionHtml: row.descriptionHtml,
    format: row.format,
    locationName: row.locationName,
    locationAddress: row.locationAddress,
    mapsUrl: row.mapsUrl,
    votingType: row.votingType ?? "SINGLE_CHOICE",
    blindVoting: row.blindVoting ?? false,
    quadraticCredits: row.quadraticCredits ?? 100,
    participationType: row.participationType,
    minTeamSize: row.minTeamSize,
    maxTeamSize: row.maxTeamSize,
    audience: row.audience,
    participationCertificate: row.participationCertificate,
    createdAt: row.createdAt.toISOString(),
  };
}

function assertSuperadmin(actor: DbUser) {
  if (actor.role !== "SUPERADMIN") throw new AuthError("FORBIDDEN", 403);
}

export async function getEventRow(eventId: string): Promise<DbEvent> {
  const [row] = await db.select().from(events).where(eq(events.id, eventId)).limit(1)
  if (!row) throw new AuthError('EVENT_NOT_FOUND', 404)
  return row
}

export async function assertEventOrganizer(actor: DbUser, eventId: string) {
  const role = await getEffectiveRole(actor, eventId);
  if (role !== "SUPERADMIN" && role !== "ORGANIZER")
    throw new AuthError("FORBIDDEN", 403);
}

export async function createEvent(
  actor: DbUser,
  input: CreateEventRequest,
): Promise<DbEvent> {
  assertSuperadmin(actor);
  const [taken] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.slug, input.slug))
    .limit(1);
  if (taken) throw new AuthError("SLUG_TAKEN", 409);
  const [row] = await db
    .insert(events)
    .values({
      title: input.title,
      slug: input.slug,
      status: "DRAFT",
      registrationEnd: input.registrationEnd ?? null,
      submissionStart: input.submissionStart ?? null,
      submissionDeadline: input.submissionDeadline ?? null,
      judgingStart: input.judgingStart ?? null,
      judgingEndTime: input.judgingEndTime ?? null,
      publicVotingStart: input.publicVotingStart ?? null,
      publicVotingEndTime: input.publicVotingEndTime ?? null,
      announcementDate: input.announcementDate ?? null,
      judgesPerSubmission: input.judgesPerSubmission ?? 3,
      doubleBlindJudging: input.doubleBlindJudging ?? false,
      assignmentAlgorithm: input.assignmentAlgorithm ?? 'K_COVER',
      normalization: input.normalization ?? 'RAW_MEAN',
      logoUrl: input.logoUrl ?? null,
      bannerUrl: input.bannerUrl ?? null,
      cardBannerUrl: input.cardBannerUrl ?? null,
      websiteUrl: input.websiteUrl ?? null,
      descriptionHtml:
        input.descriptionHtml === undefined || input.descriptionHtml === null
          ? null
          : sanitizeDescriptionHtml(input.descriptionHtml),
      format: input.format ?? "ONLINE",
      locationName: input.locationName ?? null,
      locationAddress: input.locationAddress ?? null,
      mapsUrl: input.mapsUrl ?? null,
      participationType: input.participationType ?? "TEAM",
      minTeamSize: input.minTeamSize ?? 1,
      maxTeamSize: input.maxTeamSize ?? 4,
      audience: input.audience ?? "OPEN",
      participationCertificate: input.participationCertificate ?? false,
    })
    .returning();
  return row;
}

// Whether the session may see management entry points (organizer of at
// least one event, or SUPERADMIN). UI-only: every manager API re-checks.
export async function managesAnyEvent(user: DbUser): Promise<boolean> {
  if (user.role === "SUPERADMIN") return true;
  const rows = await listUserEventRoles(user.id);
  return rows.some((row) => row.role === "ORGANIZER");
}

export async function listEvents(viewer: DbUser | null): Promise<DbEvent[]> {
  const rows = await db.select().from(events).orderBy(events.createdAt);
  if (viewer?.role === "SUPERADMIN") return rows;
  const memberships =
    viewer != null
      ? new Set((await listUserEventRoles(viewer.id)).map((row) => row.eventId))
      : new Set<string>();
  return rows.filter(
    (row) => row.status !== "DRAFT" || memberships.has(row.id),
  );
}

// Console event switcher: only events the viewer organizes (admins see
// everything). Participants and judges never appear here — the switcher is
// a management entry point, not a directory.
export async function listManagedEvents(viewer: DbUser): Promise<DbEvent[]> {
  const rows = await db.select().from(events).orderBy(events.createdAt);
  if (viewer.role === "SUPERADMIN") return rows;
  const managed = new Set(
    (await listUserEventRoles(viewer.id))
      .filter((row) => row.role === "ORGANIZER")
      .map((row) => row.eventId),
  );
  return rows.filter((row) => managed.has(row.id));
}

export async function getEvent(
  eventId: string,
  viewer: DbUser | null,
): Promise<DbEvent> {
  const row = await getEventRow(eventId);
  if (row.status === "DRAFT") {
    const memberships =
      viewer != null
        ? new Set((await listUserEventRoles(viewer.id)).map((r) => r.eventId))
        : new Set<string>();
    if (viewer?.role !== "SUPERADMIN" && !memberships.has(row.id)) {
      throw new AuthError("EVENT_NOT_FOUND", 404);
    }
  }
  return row;
}

// Public event page lookup by slug. Drafts stay hidden exactly like
// getEvent: members and superadmins may preview them, everyone else 404s.
export async function getEventBySlug(
  slug: string,
  viewer: DbUser | null,
): Promise<DbEvent> {
  const [row] = await db
    .select()
    .from(events)
    .where(eq(events.slug, slug))
    .limit(1);
  if (!row) throw new AuthError("EVENT_NOT_FOUND", 404);
  if (row.status === "DRAFT") {
    const memberships =
      viewer != null
        ? new Set((await listUserEventRoles(viewer.id)).map((r) => r.eventId))
        : new Set<string>();
    if (viewer?.role !== "SUPERADMIN" && !memberships.has(row.id)) {
      throw new AuthError("EVENT_NOT_FOUND", 404);
    }
  }
  return row;
}

// Public registration counter: PARTICIPANT mappings for the event. Used by
// the public event page ("N registrations so far"); no identity leaks.
export async function countEventRegistrations(
  eventId: string,
): Promise<number> {
  const rows = await db
    .select({ id: eventRoles.id })
    .from(eventRoles)
    .where(
      and(eq(eventRoles.eventId, eventId), eq(eventRoles.role, "PARTICIPANT")),
    );
  return rows.length;
}

// Fields an organizer may still change once the event is live. Everything
// else (title, slug, rules, tracks, prizes, judging config) freezes at
// go-live. Dates may only move to the future — pushing deadlines ahead is
// the point; rewriting history is not.
// Judging settings stay editable when live: the assignment algorithm
// applies to subsequently generated assignments, judgesPerSubmission tops up
// on the next generate, normalization recomputes on read, and double-blind
// takes effect on the next payload. Title, slug, rules, prizes, and tracks
// stay frozen via the checks below.
const LIVE_EDITABLE_EVENT_FIELDS = new Set([
  "descriptionHtml",
  "locationName",
  "locationAddress",
  "mapsUrl",
  "format",
  "websiteUrl",
  "logoUrl",
  "bannerUrl",
  "cardBannerUrl",
  "judgesPerSubmission",
  "doubleBlindJudging",
  "assignmentAlgorithm",
  "normalization",
  "registrationEnd",
  "submissionStart",
  "submissionDeadline",
  "judgingStart",
  "judgingEndTime",
  "publicVotingStart",
  "publicVotingEndTime",
  "announcementDate",
]);

const LIVE_EDITABLE_EVENT_DATES = new Set([
  "registrationEnd",
  "submissionStart",
  "submissionDeadline",
  "judgingStart",
  "judgingEndTime",
  "publicVotingStart",
  "publicVotingEndTime",
  "announcementDate",
]);

function assertLiveEventPatch(patch: Record<string, unknown>, now: Date): void {
  for (const key of Object.keys(patch)) {
    if (!LIVE_EDITABLE_EVENT_FIELDS.has(key))
      throw new AuthError("LIVE_EDIT_LOCKED", 403);
    if (LIVE_EDITABLE_EVENT_DATES.has(key)) {
      const value = patch[key];
      if (!(value instanceof Date) || value.getTime() <= now.getTime())
        throw new AuthError("LIVE_EDIT_LOCKED", 403);
    }
  }
}

export async function updateEvent(
  actor: DbUser,
  eventId: string,
  input: UpdateEventRequest,
): Promise<DbEvent> {
  const row = await getEventRow(eventId);
  await assertEventOrganizer(actor, eventId);
  const patch = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.registrationEnd !== undefined
      ? { registrationEnd: input.registrationEnd }
      : {}),
    ...(input.submissionStart !== undefined
      ? { submissionStart: input.submissionStart }
      : {}),
    ...(input.submissionDeadline !== undefined
      ? { submissionDeadline: input.submissionDeadline }
      : {}),
    ...(input.judgingStart !== undefined
      ? { judgingStart: input.judgingStart }
      : {}),
    ...(input.judgingEndTime !== undefined
      ? { judgingEndTime: input.judgingEndTime }
      : {}),
    ...(input.publicVotingStart !== undefined
      ? { publicVotingStart: input.publicVotingStart }
      : {}),
    ...(input.publicVotingEndTime !== undefined
      ? { publicVotingEndTime: input.publicVotingEndTime }
      : {}),
    ...(input.announcementDate !== undefined
      ? { announcementDate: input.announcementDate }
      : {}),
    ...(input.judgesPerSubmission !== undefined
      ? { judgesPerSubmission: input.judgesPerSubmission }
      : {}),
    ...(input.doubleBlindJudging !== undefined
      ? { doubleBlindJudging: input.doubleBlindJudging }
      : {}),
    ...(input.assignmentAlgorithm !== undefined
      ? { assignmentAlgorithm: input.assignmentAlgorithm }
      : {}),
    ...(input.normalization !== undefined
      ? { normalization: input.normalization }
      : {}),
    ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
    ...(input.bannerUrl !== undefined ? { bannerUrl: input.bannerUrl } : {}),
    ...(input.cardBannerUrl !== undefined
      ? { cardBannerUrl: input.cardBannerUrl }
      : {}),
    ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl } : {}),
    ...(input.descriptionHtml !== undefined
      ? { descriptionHtml: sanitizeDescriptionHtml(input.descriptionHtml) }
      : {}),
    ...(input.format !== undefined ? { format: input.format } : {}),
    ...(input.locationName !== undefined
      ? { locationName: input.locationName }
      : {}),
    ...(input.locationAddress !== undefined
      ? { locationAddress: input.locationAddress }
      : {}),
    ...(input.mapsUrl !== undefined ? { mapsUrl: input.mapsUrl } : {}),
    ...(input.participationType !== undefined
      ? { participationType: input.participationType }
      : {}),
    ...(input.minTeamSize !== undefined
      ? { minTeamSize: input.minTeamSize }
      : {}),
    ...(input.maxTeamSize !== undefined
      ? { maxTeamSize: input.maxTeamSize }
      : {}),
    ...(input.audience !== undefined ? { audience: input.audience } : {}),
    ...(input.participationCertificate !== undefined
      ? { participationCertificate: input.participationCertificate }
      : {}),
  };
  if (
    Object.keys(patch).length > 0 &&
    !canEditEventConfig(deriveEventStatus(row))
  ) {
    assertLiveEventPatch(patch, new Date());
  }
  if (Object.keys(patch).length === 0) return row;
  const [updated] = await db
    .update(events)
    .set(patch)
    .where(eq(events.id, eventId))
    .returning();
  return updated;
}

// Go-live (ADMIN-DASHBOARD.md Event Settings). A stored DRAFT becomes
// REGISTRATION and the phase clock (schedule dates) takes over from there,
// which puts the event on the live list. Re-publishing a live event is a
// conflict, not a silent no-op. Going live needs the actor's password plus
// a complete core schedule (registration end is mandatory).
export async function publishEvent(
  actor: DbUser,
  eventId: string,
  password: string,
): Promise<DbEvent> {
  const row = await getEventRow(eventId);
  await assertEventOrganizer(actor, eventId);
  if (!(await verifyPassword(actor.passwordHash, password))) {
    throw new AuthError("INVALID_CREDENTIALS", 401);
  }
  if (row.status !== "DRAFT") throw new AuthError("ALREADY_LIVE", 409);
  const missing = (
    ["registrationEnd", "submissionDeadline", "judgingEndTime"] as const
  ).filter((key) => row[key] == null);
  if (missing.length > 0) throw new AuthError("SCHEDULE_INCOMPLETE", 422);
  const [updated] = await db
    .update(events)
    .set({ status: "REGISTRATION" })
    .where(eq(events.id, eventId))
    .returning();
  await recordAuditLog({
    actorId: actor.id,
    action: 'EVENT_PUBLISHED',
    entityType: 'EVENT',
    entityId: eventId,
  });
  return updated;
}

async function getTrackRow(eventId: string, trackId: string) {
  const [row] = await db
    .select()
    .from(tracks)
    .where(and(eq(tracks.id, trackId), eq(tracks.eventId, eventId)))
    .limit(1);
  if (!row) throw new AuthError("TRACK_NOT_FOUND", 404);
  return row;
}

export function serializeTrack(row: typeof tracks.$inferSelect) {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    description: row.description,
    eligibilityRules: row.eligibilityRules ?? {},
  };
}

export async function listTracks(eventId: string, viewer: DbUser | null) {
  await getEvent(eventId, viewer);
  return db.select().from(tracks).where(eq(tracks.eventId, eventId));
}

export async function createTrack(
  actor: DbUser,
  eventId: string,
  input: CreateTrackRequest,
) {
  const row = await getEventRow(eventId);
  await assertEventOrganizer(actor, eventId);
  if (!canEditEventConfig(deriveEventStatus(row)))
    throw new AuthError("FORBIDDEN", 403);
  const [created] = await db
    .insert(tracks)
    .values({
      eventId,
      name: input.name,
      description: input.description ?? null,
      eligibilityRules: input.eligibilityRules ?? {},
    })
    .returning();
  return created;
}

export async function updateTrack(
  actor: DbUser,
  eventId: string,
  trackId: string,
  input: UpdateTrackRequest,
) {
  const event = await getEventRow(eventId);
  await assertEventOrganizer(actor, eventId);
  if (!canEditEventConfig(deriveEventStatus(event)))
    throw new AuthError("FORBIDDEN", 403);
  const patch = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    ...(input.eligibilityRules !== undefined
      ? { eligibilityRules: input.eligibilityRules }
      : {}),
  };
  if (Object.keys(patch).length === 0) return getTrackRow(eventId, trackId);
  const [updated] = await db
    .update(tracks)
    .set(patch)
    .where(and(eq(tracks.id, trackId), eq(tracks.eventId, eventId)))
    .returning();
  if (!updated) throw new AuthError("TRACK_NOT_FOUND", 404);
  return updated;
}

export async function deleteTrack(
  actor: DbUser,
  eventId: string,
  trackId: string,
) {
  const event = await getEventRow(eventId);
  await assertEventOrganizer(actor, eventId);
  if (!canEditEventConfig(deriveEventStatus(event)))
    throw new AuthError("FORBIDDEN", 403);
  await getTrackRow(eventId, trackId);
  const [inUse] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(eq(submissions.trackId, trackId))
    .limit(1);
  if (inUse) throw new AuthError("TRACK_IN_USE", 409);
  await db
    .delete(tracks)
    .where(and(eq(tracks.id, trackId), eq(tracks.eventId, eventId)));
}

async function getPrizeRow(eventId: string, prizeId: string) {
  const [row] = await db
    .select()
    .from(prizes)
    .where(and(eq(prizes.id, prizeId), eq(prizes.eventId, eventId)))
    .limit(1);
  if (!row) throw new AuthError("PRIZE_NOT_FOUND", 404);
  return row;
}

export function serializePrize(row: typeof prizes.$inferSelect) {
  return {
    id: row.id,
    eventId: row.eventId,
    trackId: row.trackId,
    title: row.title,
    cashValue: row.cashValue,
    kind: row.kind,
    currency: row.currency,
  };
}

export async function listPrizes(eventId: string, viewer: DbUser | null) {
  await getEvent(eventId, viewer);
  return db.select().from(prizes).where(eq(prizes.eventId, eventId));
}

export async function createPrize(
  actor: DbUser,
  eventId: string,
  input: CreatePrizeRequest,
) {
  await getEventRow(eventId);
  await assertEventOrganizer(actor, eventId);
  if (input.trackId != null)
    await getTrackRow(eventId, input.trackId).catch(() => {
      throw new AuthError("INVALID_TRACK", 422);
    });
  const [created] = await db
    .insert(prizes)
    .values({
      eventId,
      title: input.title,
      trackId: input.trackId ?? null,
      cashValue: input.cashValue,
      kind: input.kind ?? "MONETARY",
      currency: input.currency ?? "USD",
    })
    .returning();
  return created;
}

function isPrizeFloorViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P0001"
  );
}

export async function updatePrize(
  actor: DbUser,
  eventId: string,
  prizeId: string,
  input: UpdatePrizeRequest,
) {
  const event = await getEventRow(eventId);
  await assertEventOrganizer(actor, eventId);
  // Prizes freeze at go-live: not even increases (matches create/delete).
  if (deriveEventStatus(event) !== "DRAFT") throw new AuthError("PRIZE_LOCKED", 409);
  const current = await getPrizeRow(eventId, prizeId);
  if (input.trackId !== undefined && input.trackId !== null) {
    await getTrackRow(eventId, input.trackId).catch(() => {
      throw new AuthError("INVALID_TRACK", 422);
    });
  }
  if (
    input.cashValue !== undefined &&
    !canChangePrize(
      deriveEventStatus(event),
      current.cashValue,
      input.cashValue,
    )
  ) {
    throw new AuthError("PRIZE_LOCKED", 409);
  }
  const patch = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.trackId !== undefined ? { trackId: input.trackId } : {}),
    ...(input.cashValue !== undefined ? { cashValue: input.cashValue } : {}),
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
  };
  if (Object.keys(patch).length === 0) return current;
  try {
    const [updated] = await db
      .update(prizes)
      .set(patch)
      .where(and(eq(prizes.id, prizeId), eq(prizes.eventId, eventId)))
      .returning();
    if (!updated) throw new AuthError("PRIZE_NOT_FOUND", 404);
    return updated;
  } catch (error) {
    // Phase flipped between the app-level check and the write: the trigger
    // is the backstop, mapped to the same 409 the check would have raised.
    if (isPrizeFloorViolation(error)) throw new AuthError("PRIZE_LOCKED", 409);
    throw error;
  }
}

// Participant self-registration. This is the ONLY write path that grants a
// role without an organizer: it can only ever create a PARTICIPANT mapping,
// and only while the event is registering. Existing JUDGE/ORGANIZER rows
// are reported, never overwritten. DRAFT events stay hidden via getEvent.
export async function registerForEvent(actor: DbUser, eventId: string) {
  const event = await getEvent(eventId, actor)
  const existing = await getEventRole(actor.id, eventId)
  const refusal = canRegister(deriveEventStatus(event), existing)
  if (refusal === 'EVENT_NOT_OPEN') throw new AuthError('EVENT_NOT_OPEN', 409)
  if (existing) return { created: false as const, role: existing }
  if (!hasCompleteProfile(actor)) throw new AuthError('PROFILE_INCOMPLETE', 422)
  const [created] = await db
    .insert(eventRoles)
    .values({ eventId, userId: actor.id, role: 'PARTICIPANT' as const })
    .returning()
  return { created: true as const, role: created.role }
}

// Participants may leave an event (password-confirmed); stronger mappings
// need an organizer. Absent mappings 404 so strangers cannot probe
// registrations. Team members leave the team first — use leaveTeam.
export async function unregisterFromEvent(actor: DbUser, eventId: string, password: string) {
  await getEvent(eventId, actor)
  const existing = await getEventRole(actor.id, eventId)
  if (!existing) throw new AuthError('NOT_REGISTERED', 404)
  if (existing !== 'PARTICIPANT') throw new AuthError('FORBIDDEN', 403)
  if (!(await verifyPassword(actor.passwordHash, password))) {
    throw new AuthError('INVALID_CREDENTIALS', 401)
  }
  const teamRows = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(eq(teams.eventId, eventId), eq(teamMembers.userId, actor.id)))
    .limit(1)
  if (teamRows.length > 0) throw new AuthError('IN_TEAM', 409)
  await db
    .delete(eventRoles)
    .where(and(eq(eventRoles.eventId, eventId), eq(eventRoles.userId, actor.id)))
}

// Personal event list for My Hackathons: every event where the viewer holds
// a role mapping or sits on a team, current or past. No status filter —
// participation history is the point.
export async function getMyEvents(userId: string) {
  const [roleRows, teamRows] = await Promise.all([
    db
      .select({ eventId: eventRoles.eventId, role: eventRoles.role })
      .from(eventRoles)
      .where(eq(eventRoles.userId, userId)),
    db
      .select({ eventId: teams.eventId })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, userId)),
  ])
  const roles = new Map<string, string>()
  for (const row of roleRows) roles.set(row.eventId, row.role)
  const ids = new Set<string>([...roles.keys(), ...teamRows.map((row) => row.eventId)])
  if (ids.size === 0) return []
  const rows = await db.select().from(events).where(inArray(events.id, [...ids]))
  return rows.map((row) => ({
    ...serializeEvent(row),
    myRole: roles.get(row.id) ?? 'TEAM_MEMBER',
  }))
}

export async function deletePrize(
  actor: DbUser,
  eventId: string,
  prizeId: string,
) {
  const event = await getEventRow(eventId);
  await assertEventOrganizer(actor, eventId);
  if (deriveEventStatus(event) !== "DRAFT")
    throw new AuthError("PRIZE_LOCKED", 409);
  await getPrizeRow(eventId, prizeId);
  await db
    .delete(prizes)
    .where(and(eq(prizes.id, prizeId), eq(prizes.eventId, eventId)));
}
