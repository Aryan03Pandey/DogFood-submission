import { sql } from "drizzle-orm";
import type { SubmissionAsset } from "../lib/submissions";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  real,
  pgEnum,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", [
  "SUPERADMIN",
  "ORGANIZER",
  "JUDGE",
  "PARTICIPANT",
]);
export const eventRoleEnum = pgEnum("event_role", [
  "ORGANIZER",
  "JUDGE",
  "PARTICIPANT",
]);
export const eventStatusEnum = pgEnum("event_status", [
  "DRAFT",
  "REGISTRATION",
  "SUBMISSION",
  "JUDGING",
  "PUBLIC_VOTING",
  "PUBLISHED",
]);
export const memberRoleEnum = pgEnum("member_role", ["LEADER", "MEMBER"]);
export const eventFormatEnum = pgEnum("event_format", [
  "ONLINE",
  "OFFLINE",
  "HYBRID",
]);
export const participationTypeEnum = pgEnum("participation_type", [
  "INDIVIDUAL",
  "TEAM",
]);
export const audienceEnum = pgEnum("audience", [
  "STUDENT",
  "PROFESSIONAL",
  "OPEN",
]);
export const prizeKindEnum = pgEnum("prize_kind", [
  "MONETARY",
  "IN_KIND",
  "CERTIFICATE",
]);
export const assignmentAlgorithmEnum = pgEnum("assignment_algorithm", [
  "ROUND_ROBIN",
  "K_COVER",
]);
export const normalizationEnum = pgEnum("normalization", [
  "RAW_MEAN",
  "Z_SCORE",
  "MIN_MAX",
  "TRIMMED_MEAN",
]);
export const flagReasonEnum = pgEnum("flag_reason", [
  "PLAGIARISM",
  "OFF_TOPIC",
  "INCOMPLETE",
  "INAPPROPRIATE",
  "OTHER",
]);

const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const professionEnum = pgEnum("profession", [
  "STUDENT",
  "PROFESSIONAL",
]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  // Display name (e.g. fixture judges carry names; team members may be
  // email-only). Nullable because credentials, not identity, gate access.
  // The profile form maintains it as "firstName lastName".
  name: text("name"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  countryCode: text("country_code"),
  phoneNumber: text("phone_number"),
  profession: professionEnum("profession"),
  country: text("country"),
  skills: jsonb("skills").$type<string[]>().notNull().default([]),
  linkedinUrl: text("linkedin_url"),
  githubUrl: text("github_url"),
  // Maintained by updateProfile: true when first name, last name, and
  // profession are all present. Incomplete profiles save regardless.
  profileComplete: boolean("profile_complete").notNull().default(false),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("PARTICIPANT"),
  organization: text("organization"),
  createdAt: createdAt(),
});

// Showcase projects on a user's profile. Edited as a whole list from the
// profile form (optional, multiple allowed); rows die with the account.
export const userProjects = pgTable(
  "user_projects",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    repoUrl: text("repo_url"),
    hostedUrl: text("hosted_url"),
    createdAt: createdAt(),
  },
  (t) => ({ userProjectsUserIdx: index("user_projects_user_idx").on(t.userId) }),
);

export const sessions = pgTable("sessions", {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ sessionsUserIdx: index("sessions_user_idx").on(t.userId) }),
);

export const events = pgTable("events", {
  id: id(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  status: eventStatusEnum("status").notNull().default("DRAFT"),
  registrationEnd: timestamp("registration_end", { withTimezone: true }),
  submissionStart: timestamp("submission_start", { withTimezone: true }),
  submissionDeadline: timestamp("submission_deadline", {
    withTimezone: true,
  }),
  judgingStart: timestamp("judging_start", { withTimezone: true }),
  judgingEndTime: timestamp("judging_end_time", {
    withTimezone: true,
  }),
  publicVotingStart: timestamp("public_voting_start", { withTimezone: true }),
  publicVotingEndTime: timestamp("public_voting_end_time", {
    withTimezone: true,
  }),
  announcementDate: timestamp("announcement_date", { withTimezone: true }),
  judgesPerSubmission: integer("judges_per_submission").notNull().default(3),
  doubleBlindJudging: boolean("double_blind_judging").notNull().default(false),
  // Judging engines (JUDGING-FEATURE.md): the organizer picks one assignment
  // algorithm and one normalization; generate/rankings read these columns.
  assignmentAlgorithm: assignmentAlgorithmEnum("assignment_algorithm")
    .notNull()
    .default("K_COVER"),
  normalization: normalizationEnum("normalization").notNull().default("RAW_MEAN"),
  // Community Voting (Tier 3)
  votingType: text("voting_type").notNull().default("SINGLE_CHOICE"),
  blindVoting: boolean("blind_voting").notNull().default(false),
  quadraticCredits: integer("quadratic_credits").notNull().default(100),
  // Creation-wizard fields (EVENT-CREATION.md).
  logoUrl: text("logo_url"),
  bannerUrl: text("banner_url"),
  cardBannerUrl: text("card_banner_url"),
  websiteUrl: text("website_url"),
  descriptionHtml: text("description_html"),
  format: eventFormatEnum("format").notNull().default("ONLINE"),
  locationName: text("location_name"),
  locationAddress: text("location_address"),
  mapsUrl: text("maps_url"),
  participationType: participationTypeEnum("participation_type")
    .notNull()
    .default("TEAM"),
  minTeamSize: integer("min_team_size").notNull().default(1),
  maxTeamSize: integer("max_team_size").notNull().default(4),
  audience: audienceEnum("audience").notNull().default("OPEN"),
  participationCertificate: boolean("participation_certificate")
    .notNull()
    .default(false),
  createdAt: createdAt(),
},
(t) => ({ minMaxCheck: check("events_min_max_ck", sql`${t.minTeamSize} <= ${t.maxTeamSize}`) }));

export const tracks = pgTable("tracks", {
  id: id(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  eligibilityRules: jsonb("eligibility_rules")
    .$type<Record<string, unknown>>()
    .default({}),
});
export const prizes = pgTable("prizes", {
  id: id(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  trackId: uuid("track_id").references(() => tracks.id),
  title: text("title").notNull(),
  cashValue: integer("cash_value").notNull(),
  kind: prizeKindEnum("kind").notNull().default("MONETARY"),
  currency: text("currency").notNull().default("USD"),
});
export const teams = pgTable("teams", {
  id: id(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  inviteCodeHash: text("invite_code_hash").notNull(),
  // Null = never expires (fixture/legacy rows). Fresh codes carry issued-at
  // plus TTL; joins compare against now().
  inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
  isLocked: boolean("is_locked").notNull().default(false),
  createdAt: createdAt(),
});
export const teamMembers = pgTable(
  "team_members",
  {
    id: id(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("MEMBER"),
    // Column name is explicit: the shared createdAt() helper hardcodes
    // "created_at", but this table's migration column is "joined_at".
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    teamMemberUnique: uniqueIndex("team_member_unique").on(t.teamId, t.userId),
    // Exactly one LEADER per team, enforced where it counts: at the DB.
    oneLeaderPerTeam: uniqueIndex("one_leader_per_team")
      .on(t.teamId)
      .where(sql`role = 'LEADER'`),
  }),
);
export const submissions = pgTable(
  "submissions",
  {
    id: id(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    // Nullable: drafts start trackless (the team picks a track in the
    // form); finalize requires one, so finals always join cleanly.
    trackId: uuid("track_id").references(() => tracks.id),
    title: text("title").notNull().default("Untitled project"),
    tagline: text("tagline"),
    description: text("description"),
    techStack: jsonb("tech_stack").$type<string[]>().default([]),
    repoUrl: text("repo_url"),
    demoUrl: text("demo_url"),
    assetKeys: jsonb("asset_keys").$type<SubmissionAsset[]>().default([]),
    isDraft: boolean("is_draft").notNull().default(true),
    isHidden: boolean("is_hidden").notNull().default(false),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({ submissionsTeamIdx: index("submissions_team_idx").on(t.teamId) }),
);
export interface RubricCriterion {
  id: string;
  label: string;
  weight: number;
  minScore: number;
  maxScore: number;
  // int: whole numbers only; float: multiples of step within [minScore, maxScore].
  kind: "int" | "float";
  step: number;
}
export const rubrics = pgTable("rubrics", {
  id: id(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  criteriaJson: jsonb("criteria_json").$type<RubricCriterion[]>().notNull(),
});
// Judge track expertise (fixture judges declare tracks[] they can review).
// Distinct from judge_assignments, which maps a judge to a specific
// submission: this table records which tracks a judge is qualified for.
export const judgeTracks = pgTable(
  "judge_tracks",
  {
    id: id(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({
    judgeTrackUnique: uniqueIndex("judge_track_unique").on(
      t.judgeId,
      t.trackId,
    ),
  }),
);
export const conflictsOfInterest = pgTable(
  "conflicts_of_interest",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    coiUnique: uniqueIndex("coi_unique").on(t.judgeId, t.teamId),
    coiEventIdx: index("coi_event_idx").on(t.eventId),
  }),
);
export const judgeAssignments = pgTable(
  "judge_assignments",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => users.id),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("PENDING"),
  },
  (t) => ({
    judgeSubmissionUnique: uniqueIndex("judge_submission_unique").on(
      t.judgeId,
      t.submissionId,
    ),
  }),
);
export const scores = pgTable(
  "scores",
  {
    id: id(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => judgeAssignments.id, { onDelete: "cascade" }),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => users.id),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id),
    rubricScoresJson: jsonb("rubric_scores_json")
      .$type<Record<string, number>>()
      .notNull(),
    rawTotal: real("raw_total").notNull(),
    // Judge's written remark (blank fixture comments load as NULL).
    comment: text("comment"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    scoreAssignmentUnique: uniqueIndex("score_assignment_unique").on(
      t.assignmentId,
    ),
  }),
);
// Judge flags on an assignment (JUDGING-FEATURE.md Flag action). One live
// flag per assignment; judge-private until results are published.
export const submissionFlags = pgTable(
  "submission_flags",
  {
    id: id(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => judgeAssignments.id, { onDelete: "cascade" }),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => users.id),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    reason: flagReasonEnum("reason").notNull(),
    comment: text("comment"),
    createdAt: createdAt(),
  },
  (t) => ({
    flagAssignmentUnique: uniqueIndex("flag_assignment_unique").on(
      t.assignmentId,
    ),
  }),
);
export const pairwiseComparisons = pgTable("pairwise_comparisons", {
  id: id(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id),
  judgeId: uuid("judge_id")
    .notNull()
    .references(() => users.id),
  winnerSubmissionId: uuid("winner_submission_id")
    .notNull()
    .references(() => submissions.id),
  loserSubmissionId: uuid("loser_submission_id")
    .notNull()
    .references(() => submissions.id),
  createdAt: createdAt(),
});
export const votes = pgTable("votes", {
  id: id(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id),
  voterFingerprint: text("voter_fingerprint").notNull(),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => submissions.id),
  voteWeight: integer("vote_weight").notNull().default(1),
  createdAt: createdAt(),
});
export const auditLogs = pgTable("audit_logs", {
  id: id(),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});
// Public half of the Ed25519 signing keypair (src/server/crypto/keys.ts holds
// the private PEM on disk, never in this table). Supports rotation: retiring
// a key (setting retiredAt) leaves older signatures still verifiable.
export const signingKeys = pgTable("signing_keys", {
  kid: text("kid").primaryKey(),
  publicKeyPem: text("public_key_pem").notNull(),
  createdAt: createdAt(),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
});

// Long-lived bearer credentials for scripts/integrations (dfk_<random>).
// Hashed identically to sessions (SHA-256, raw value never stored) so a
// leaked DB row is as useless as a leaked session row; unlike sessions they
// carry a human label and are resolved alongside the session cookie in
// src/server/http.ts, mapping to the same SessionUser shape.
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    // First 12 chars of the raw token (e.g. "dfk_Ab12Cd34"), stored in the
    // clear purely for display in a token list — the hash alone can't be
    // turned back into anything showable.
    tokenPrefix: text("token_prefix").notNull(),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({ apiTokensHashUnique: uniqueIndex("api_tokens_hash_unique").on(t.tokenHash) }),
);

// Public comments on a finalized submission (Tier-3 voting page). Anyone can
// read; posting needs a session; organizers can remove. Soft delete keeps
// the thread readable after moderation.
export const submissionComments = pgTable("submission_comments", {
  id: id(),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  authorName: text("author_name").notNull().default("A voter"),
  body: text("body").notNull(),
  isHidden: boolean("is_hidden").notNull().default(false),
  createdAt: createdAt(),
});
// Event-contextual RBAC: a user's permission is scoped to (event_id, role).
// users.role carries only the global flag (SUPERADMIN bypasses all event checks);
// every other permission resolves through this table, defaulting to PARTICIPANT.
export const eventRoles = pgTable(
  "event_roles",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: eventRoleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    eventRoleUnique: uniqueIndex("event_role_unique").on(t.eventId, t.userId),
    eventRoleUserIdx: index("event_role_user_idx").on(t.userId),
  }),
);

// Organizer-registered delivery targets for a single event's webhook
// notifications (Tier 4.5). `secret` is the HMAC key, shown once on
// creation and never returned again — same treatment as an API token's raw
// value (token-service.ts).
export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: id(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
});

// The outbox (Tier 4.5): one row per (endpoint, event occurrence) to
// deliver. eventId is denormalized off webhookEndpoints purely so the
// singleton-per-event event types below can be deduplicated with a partial
// unique index instead of an app-level existence check.
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Set while a worker holds the row; a lease that has expired (worker
    // crashed mid-delivery) is reclaimed by the next poll instead of a
    // separate cleanup job — see scripts/webhook-worker.ts.
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => ({
    // judging.completed and results.published are per-event singletons;
    // submission.created legitimately fires many times per event and is
    // excluded from this constraint via the WHERE clause.
    webhookDeliveriesSingletonEventIdx: uniqueIndex(
      "webhook_deliveries_singleton_event_idx",
    )
      .on(t.endpointId, t.eventId, t.eventType)
      .where(sql`event_type IN ('judging.completed', 'results.published')`),
  }),
);

// Organizer-recorded prize winners (Tier 4.7 needs this to exist before a
// "winner certificate" means anything — prizes previously only stored the
// prize definition, never who won it). One winner per prize.
export const prizeAwards = pgTable("prize_awards", {
  id: id(),
  prizeId: uuid("prize_id")
    .notNull()
    .unique()
    .references(() => prizes.id, { onDelete: "cascade" }),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  // Explicit column name: the shared createdAt() helper hardcodes
  // "created_at", but this table's migration column is "awarded_at".
  awardedAt: timestamp("awarded_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  awardedBy: uuid("awarded_by")
    .notNull()
    .references(() => users.id),
});

export type UserRole = (typeof roleEnum.enumValues)[number];
export type EventRole = (typeof eventRoleEnum.enumValues)[number];
export type DbUser = typeof users.$inferSelect;
export type DbUserProject = typeof userProjects.$inferSelect;
export type DbTeam = typeof teams.$inferSelect;
export type DbTeamMember = typeof teamMembers.$inferSelect;
export type DbEvent = typeof events.$inferSelect;

// Resolve the effective role for (globalRole, eventRole): SUPERADMIN is the
// only global flag and bypasses event checks; everyone else resolves through
// their event mapping and defaults to PARTICIPANT.
export function resolveEffectiveRole(
  globalRole: UserRole,
  eventRole: EventRole | null | undefined,
): UserRole {
  if (globalRole === "SUPERADMIN") return "SUPERADMIN";
  return eventRole ?? "PARTICIPANT";
}

// Who may grant `target` inside an event: SUPERADMIN can grant anything;
// an ORGANIZER of that event can grant ORGANIZER/JUDGE/PARTICIPANT but can
// never grant SUPERADMIN (global flags are not event-scoped).
export function canAssignEventRole(
  actor: UserRole,
  target: EventRole,
): boolean {
  if (actor === "SUPERADMIN") return true;
  if (actor === "ORGANIZER") return true;
  return false;
}
export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;

export const allTables = {
  users,
  sessions,
  events,
  eventRoles,
  tracks,
  prizes,
  teams,
  teamMembers,
  submissions,
  rubrics,
  judgeTracks,
  judgeAssignments,
  scores,
  submissionFlags,
  pairwiseComparisons,
  votes,
  submissionComments,
  auditLogs,
  signingKeys,
  apiTokens,
  conflictsOfInterest,
  webhookEndpoints,
  webhookDeliveries,
  prizeAwards,
};
// PostgreSQL production migrations should add pg_trgm, tsvector indexes, roster cardinality checks, and the prize floor trigger.
// Roster limits mirror REQUIREMENTS §4 (Team Engine): $1 \le Team Size \le 4$,
// enforced at the API boundary by validateTeamSize. They are constants by
// default but overridable via TEAM_MIN_SIZE / TEAM_MAX_SIZE (e.g. staging
// experiments); invalid values fall back to the product defaults and max is
// always clamped to be >= min so the range can never invert.
export function resolveConstraints(
  env: Record<string, string | undefined> = process.env,
): {
  minTeamSize: number;
  maxTeamSize: number;
  maxTaglineLength: number;
} {
  const minTeamSize = parsePositiveInt(env.TEAM_MIN_SIZE, 1);
  const maxTeamSize = Math.max(
    parsePositiveInt(env.TEAM_MAX_SIZE, 4),
    minTeamSize,
  );
  return { minTeamSize, maxTeamSize, maxTaglineLength: 140 };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value >= 1 ? value : fallback;
}

export const constraints = resolveConstraints();

export function deriveEventStatus(
  event: {
    status: EventStatus;
    registrationEnd?: Date | null;
    submissionStart?: Date | null;
    submissionDeadline?: Date | null;
    judgingStart?: Date | null;
    judgingEndTime?: Date | null;
    publicVotingStart?: Date | null;
    publicVotingEndTime?: Date | null;
  },
  now = new Date(),
): EventStatus {
  if (event.status === "DRAFT") return "DRAFT";
  // Explicit per-phase boundaries win; each falls back to the legacy implied
  // boundary so events without the newer columns derive exactly as before.
  // Null deadlines (incomplete DRAFT shells) fail every comparison, so such
  // rows fall through to PUBLISHED — listings filter dateless rows first.
  const judgingStart = event.judgingStart ?? event.submissionDeadline;
  const publicVotingStart = event.publicVotingStart ?? event.judgingEndTime;
  if (event.registrationEnd != null && now < event.registrationEnd)
    return "REGISTRATION";
  if (event.submissionDeadline != null && now <= event.submissionDeadline)
    return "SUBMISSION";
  if (judgingStart != null && now < judgingStart) return "JUDGING";
  if (publicVotingStart != null && now <= publicVotingStart) return "JUDGING";
  if (event.publicVotingEndTime != null && now <= event.publicVotingEndTime)
    return "PUBLIC_VOTING";
  return "PUBLISHED";
}

export function canEditSubmission(
  event: Pick<typeof events.$inferSelect, "submissionDeadline">,
  now = new Date(),
) {
  return event.submissionDeadline != null && now <= event.submissionDeadline;
}

// Self-registration rule: any signed-in user may join an event that is
// actively registering, unless they already hold a stronger mapping
// (JUDGE/ORGANIZER keep their role; the endpoint leaves those rows alone).
// Returns null when allowed, otherwise the refusal code for the API.
export function canRegister(
  status: EventStatus,
  existingRole: EventRole | null,
): "EVENT_NOT_OPEN" | "ALREADY_REGISTERED" | null {
  if (status !== "REGISTRATION") return "EVENT_NOT_OPEN";
  if (existingRole !== null && existingRole !== "PARTICIPANT")
    return "ALREADY_REGISTERED";
  return null;
}
export function canChangePrize(
  eventStatus: EventStatus,
  previous: number,
  next: number,
) {
  return eventStatus === "DRAFT" || next >= previous;
}

// Phase gating for organizer actions: `allowed` lists the effective
// statuses an action may run in. Callers resolve the status with
// deriveEventStatus (server clock) and answer 403 otherwise.
export function phaseAllows(
  status: EventStatus,
  allowed: readonly EventStatus[],
): boolean {
  return allowed.includes(status);
}

// Structural configuration (schedule, tracks) is a DRAFT-only action.
export function canEditEventConfig(status: EventStatus): boolean {
  return phaseAllows(status, ["DRAFT"]);
}

export interface TeamEligibilityMeta {
  size: number;
  isStudentOnly?: boolean;
  techStack?: string[];
}

// Validates a team's metadata against a track's eligibility_rules payload
// (e.g. { max_team_size: 2, student_only: true, required_tech: ["postgres"] }).
// Unknown or malformed rule keys are ignored so old rules stay permissive
// when new rule kinds appear. Returns violation codes, empty when eligible.
export function validateTrackEligibility(
  team: TeamEligibilityMeta,
  rules: Record<string, unknown> | null | undefined,
): string[] {
  const violations: string[] = [];
  if (!rules || typeof rules !== "object") return violations;
  const maxTeamSize = rules["max_team_size"];
  if (
    typeof maxTeamSize === "number" &&
    Number.isSafeInteger(maxTeamSize) &&
    maxTeamSize >= 1
  ) {
    if (team.size > maxTeamSize) violations.push("MAX_TEAM_SIZE");
  }
  if (rules["student_only"] === true && team.isStudentOnly !== true) {
    violations.push("STUDENT_ONLY");
  }
  const requiredTech = rules["required_tech"];
  if (Array.isArray(requiredTech) && requiredTech.length > 0) {
    const stack = new Set(
      (team.techStack ?? []).map((entry) => entry.toLowerCase()),
    );
    const missing = requiredTech.filter(
      (entry) => typeof entry === "string" && !stack.has(entry.toLowerCase()),
    );
    if (missing.length > 0) violations.push("REQUIRED_TECH");
  }
  return violations;
}

export function isPublicSubmission(
  eventStatus: EventStatus,
  submission: Pick<Submission, "isDraft" | "isHidden">,
) {
  return (
    !submission.isDraft &&
    !submission.isHidden &&
    ["JUDGING", "PUBLIC_VOTING", "PUBLISHED"].includes(eventStatus)
  );
}

export function validateUrl(value: string) {
  return /^https?:\/\/[^\s]+$/i.test(value);
}
export function validateTagline(value: string) {
  return value.length <= constraints.maxTaglineLength;
}
export function validateTeamSize(size: number) {
  return size >= constraints.minTeamSize && size <= constraints.maxTeamSize;
}

export function zScore(value: number, mean: number, standardDeviation: number) {
  return standardDeviation === 0 ? 0 : (value - mean) / standardDeviation;
}
export function minMax(value: number, min: number, max: number) {
  return max === min ? 50 : ((value - min) / (max - min)) * 100;
}
export function trimmedMean(values: number[]) {
  if (values.length < 5)
    return values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
  const sorted = [...values].sort((a, b) => a - b).slice(1, -1);
  return sorted.reduce((a, b) => a + b, 0) / sorted.length;
}
export function weightedMean(
  scores: Record<string, number>,
  criteria: Array<{ id: string; weight: number }>,
) {
  return criteria.reduce((sum, c) => sum + (scores[c.id] ?? 0) * c.weight, 0);
}
export function bradleyTerryProbability(
  winnerStrength: number,
  loserStrength: number,
) {
  return winnerStrength / (winnerStrength + loserStrength);
}

export function seededOrder<T>(items: T[], seed: string) {
  // FNV-1a seed hash feeding mulberry32 + Fisher-Yates: the previous
  // multiplicative-key scheme hashed consecutive integers, so nearby seeds
  // routinely produced identical permutations and positional bias survived.
  let hash = 2166136261;
  for (const char of seed)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  let state = hash >>> 0;
  const rand = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function inviteTokenHash(token: string) {
  return token;
}
export function generateInviteToken() {
  // Canonical form: no separators (see normalizeInviteToken). Display code
  // adds dashes for air-gapped copying; codes are stored hashed.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `DF${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}
