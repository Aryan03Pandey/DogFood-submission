import { z } from 'zod'
import { roleSchema, eventRoleSchema, uuidSchema } from './schemas'
import { signedEnvelopeSchema } from './envelope-schema'

// One row schema per table in src/db/schema.ts's allTables (minus sessions
// and api_tokens, which are never exported — see docs/TIER4.md 4.3). Dates
// cross the export boundary as ISO strings; the service layer converts to/
// from Date when reading from / writing to Postgres.

const memberRoleSchema = z.enum(['LEADER', 'MEMBER'])
const eventStatusSchema = z.enum(['DRAFT', 'REGISTRATION', 'SUBMISSION', 'JUDGING', 'PUBLIC_VOTING', 'PUBLISHED'])
const professionSchema = z.enum(['STUDENT', 'PROFESSIONAL'])
const eventFormatSchema = z.enum(['ONLINE', 'OFFLINE', 'HYBRID'])
const participationTypeSchema = z.enum(['INDIVIDUAL', 'TEAM'])
const audienceSchema = z.enum(['STUDENT', 'PROFESSIONAL', 'OPEN'])
const prizeKindSchema = z.enum(['MONETARY', 'IN_KIND', 'CERTIFICATE'])

export const userRowSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  name: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  countryCode: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  profession: professionSchema.nullable(),
  country: z.string().nullable(),
  skills: z.array(z.string()),
  linkedinUrl: z.string().nullable(),
  githubUrl: z.string().nullable(),
  profileComplete: z.boolean(),
  // Excluded from export by default (docs/TIER4.md 4.3); when absent, import
  // assigns one shared throwaway hash for the whole operation.
  passwordHash: z.string().nullable().optional(),
  role: roleSchema,
  organization: z.string().nullable(),
  createdAt: z.string(),
})

export const userProjectRowSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  title: z.string(),
  description: z.string().nullable(),
  repoUrl: z.string().nullable(),
  hostedUrl: z.string().nullable(),
  createdAt: z.string(),
})

export const eventRoleRowSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  userId: uuidSchema,
  role: eventRoleSchema,
  createdAt: z.string(),
})

export const eventRowSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  slug: z.string(),
  status: eventStatusSchema,
  // Dates are nullable: a DRAFT shell (title + slug only) can exist before
  // the timeline step is complete — see deriveEventStatus's null handling
  // and getGalleryProjects'/getEventGalleryProjects' dateless-shell guards.
  registrationEnd: z.string().nullable(),
  submissionStart: z.string().nullable(),
  submissionDeadline: z.string().nullable(),
  judgingStart: z.string().nullable(),
  judgingEndTime: z.string().nullable(),
  publicVotingStart: z.string().nullable(),
  publicVotingEndTime: z.string().nullable(),
  announcementDate: z.string().nullable(),
  judgesPerSubmission: z.number().int(),
  doubleBlindJudging: z.boolean(),
  logoUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  cardBannerUrl: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  descriptionHtml: z.string().nullable(),
  format: eventFormatSchema,
  locationName: z.string().nullable(),
  locationAddress: z.string().nullable(),
  mapsUrl: z.string().nullable(),
  participationType: participationTypeSchema,
  minTeamSize: z.number().int(),
  maxTeamSize: z.number().int(),
  audience: audienceSchema,
  participationCertificate: z.boolean(),
  createdAt: z.string(),
})

export const trackRowSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  eligibilityRules: z.record(z.string(), z.unknown()).nullable(),
})

export const prizeRowSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  trackId: uuidSchema.nullable(),
  title: z.string(),
  cashValue: z.number().int(),
  kind: prizeKindSchema,
  currency: z.string(),
})

export const teamRowSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  name: z.string(),
  inviteCodeHash: z.string(),
  inviteExpiresAt: z.string().nullable(),
  isLocked: z.boolean(),
  createdAt: z.string(),
})

export const teamMemberRowSchema = z.object({
  id: uuidSchema,
  teamId: uuidSchema,
  userId: uuidSchema,
  role: memberRoleSchema,
  joinedAt: z.string(),
})

export const submissionAssetSchema = z.object({
  key: z.string(),
  name: z.string(),
  sizeBytes: z.number(),
  mime: z.string(),
})

export const submissionRowSchema = z.object({
  id: uuidSchema,
  teamId: uuidSchema,
  // Nullable: drafts start trackless; finalize requires a track.
  trackId: uuidSchema.nullable(),
  title: z.string(),
  tagline: z.string().nullable(),
  description: z.string().nullable(),
  techStack: z.array(z.string()).nullable(),
  repoUrl: z.string().nullable(),
  demoUrl: z.string().nullable(),
  assetKeys: z.array(submissionAssetSchema).nullable(),
  isDraft: z.boolean(),
  isHidden: z.boolean(),
  submittedAt: z.string().nullable(),
  updatedAt: z.string(),
})

export const rubricCriterionSchema = z.object({
  id: z.string(),
  label: z.string(),
  weight: z.number(),
  minScore: z.number(),
  maxScore: z.number(),
  kind: z.enum(['int', 'float']),
  step: z.number(),
})

export const rubricRowSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  title: z.string(),
  criteriaJson: z.array(rubricCriterionSchema),
})

export const judgeTrackRowSchema = z.object({
  id: uuidSchema,
  trackId: uuidSchema,
  judgeId: uuidSchema,
})

export const conflictOfInterestRowSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  judgeId: uuidSchema,
  teamId: uuidSchema,
  reason: z.string(),
  createdAt: z.string(),
})

export const judgeAssignmentRowSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  judgeId: uuidSchema,
  submissionId: uuidSchema,
  status: z.string(),
})

export const scoreRowSchema = z.object({
  id: uuidSchema,
  assignmentId: uuidSchema,
  judgeId: uuidSchema,
  submissionId: uuidSchema,
  rubricScoresJson: z.record(z.string(), z.number()),
  rawTotal: z.number(),
  comment: z.string().nullable(),
  submittedAt: z.string(),
})

export const pairwiseComparisonRowSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  judgeId: uuidSchema,
  winnerSubmissionId: uuidSchema,
  loserSubmissionId: uuidSchema,
  createdAt: z.string(),
})

export const voteRowSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  voterFingerprint: z.string(),
  submissionId: uuidSchema,
  voteWeight: z.number().int(),
  createdAt: z.string(),
})

export const auditLogRowSchema = z.object({
  id: uuidSchema,
  actorId: uuidSchema.nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: uuidSchema.nullable(),
  payloadJson: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
})

export const signingKeyRowSchema = z.object({
  kid: z.string(),
  publicKeyPem: z.string(),
  createdAt: z.string(),
  retiredAt: z.string().nullable(),
})

export const prizeAwardRowSchema = z.object({
  id: uuidSchema,
  prizeId: uuidSchema,
  submissionId: uuidSchema,
  awardedAt: z.string(),
  awardedBy: uuidSchema,
})

// FK-safe order, front to back: users and event_roles first (almost
// everything else references a user), audit_logs and signing_keys last
// (referenced by nothing). Both export-service and import-service iterate
// this same order.
export const exportDataSchema = z.object({
  users: z.array(userRowSchema),
  user_projects: z.array(userProjectRowSchema),
  event_roles: z.array(eventRoleRowSchema),
  events: z.array(eventRowSchema),
  tracks: z.array(trackRowSchema),
  prizes: z.array(prizeRowSchema),
  teams: z.array(teamRowSchema),
  team_members: z.array(teamMemberRowSchema),
  submissions: z.array(submissionRowSchema),
  rubrics: z.array(rubricRowSchema),
  judge_tracks: z.array(judgeTrackRowSchema),
  conflicts_of_interest: z.array(conflictOfInterestRowSchema),
  judge_assignments: z.array(judgeAssignmentRowSchema),
  scores: z.array(scoreRowSchema),
  pairwise_comparisons: z.array(pairwiseComparisonRowSchema),
  votes: z.array(voteRowSchema),
  prize_awards: z.array(prizeAwardRowSchema),
  audit_logs: z.array(auditLogRowSchema),
  signing_keys: z.array(signingKeyRowSchema),
})

export const exportEnvelopeSchema = z.object({
  format: z.literal('dogfood-export'),
  version: z.literal(1),
  exported_at: z.string(),
  scope: z.enum(['event', 'instance']),
  data: exportDataSchema,
})

export type ExportData = z.infer<typeof exportDataSchema>
export type ExportEnvelope = z.infer<typeof exportEnvelopeSchema>
export const EXPORT_TABLE_ORDER = Object.keys(exportDataSchema.shape) as Array<keyof ExportData>

// Documentation-only shape (OpenAPI) for what export-service.ts actually
// returns and import-service.ts actually accepts: every export is signed
// (see src/server/signing-service.ts's SignedEnvelope), though import still
// takes a bare ExportEnvelope too for backward compatibility.
export const signedExportEnvelopeSchema = signedEnvelopeSchema('export', exportEnvelopeSchema)
