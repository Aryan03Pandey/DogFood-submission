import { z } from 'zod'
import { uuidSchema } from './schemas'
import { signedEnvelopeSchema } from './envelope-schema'

// Tier 4.6. Deliberately aggregate-only — see records-service.ts's comment
// on why no rubric scores/comments/submission IDs ever appear here.
export const judgeRecordPayloadSchema = z.object({
  eventId: uuidSchema,
  judgeId: uuidSchema,
  judgeName: z.string().nullable(),
  assignedCount: z.number().int(),
  completedCount: z.number().int(),
  firstScoredAt: z.string().nullable(),
  lastScoredAt: z.string().nullable(),
})

export const resultsManifestRankingRowSchema = z.object({
  submissionId: uuidSchema,
  title: z.string(),
  teamName: z.string(),
  scoreCount: z.number().int(),
  raw: z.number(),
  zScore: z.number(),
  minMax: z.number(),
  trimmedMean: z.number(),
  totalVotes: z.number(),
})

export const resultsManifestPayloadSchema = z.object({
  eventId: uuidSchema,
  eventTitle: z.string(),
  generatedAt: z.string(),
  rankings: z.array(resultsManifestRankingRowSchema),
})

export const signedJudgeRecordEnvelopeSchema = signedEnvelopeSchema('judge-record', judgeRecordPayloadSchema)
export const signedResultsManifestEnvelopeSchema = signedEnvelopeSchema(
  'results-manifest',
  resultsManifestPayloadSchema,
)
