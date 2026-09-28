import { z } from "zod";

const uuid = z.string().uuid();

export const eventIdQuerySchema = z.object({ eventId: uuid.optional() });
export const eventIdBodySchema = z.object({ eventId: uuid });
export const judgeInviteSchema = z.object({ eventId: uuid, userId: uuid });
export const judgeRemovalSchema = z.object({
  eventId: uuid,
  userId: uuid,
  password: z.string().min(1).max(256),
});
export const judgeTracksSchema = z.object({
  eventId: uuid,
  trackIds: z.array(uuid),
});
export const conflictSchema = z.object({
  eventId: uuid,
  judgeId: uuid,
  teamId: uuid,
});
const criterionSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(160),
    weight: z.number().finite().min(0),
    minScore: z.number().finite(),
    maxScore: z.number().finite(),
    kind: z.enum(['int', 'float']).default('int'),
    step: z.number().finite().min(0.01).max(1).default(1),
  })
  .superRefine((criterion, ctx) => {
    if (!(criterion.maxScore > criterion.minScore)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'maxScore must exceed minScore.' });
    }
    if (criterion.kind === 'int' && criterion.step !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'int criteria score in whole steps of 1.' });
    }
  });
export const rubricSchema = z.object({
  eventId: uuid,
  id: uuid.optional(),
  title: z.string().trim().min(1).max(160),
  criteriaJson: z.array(criterionSchema).min(1),
});
export const assignmentGenerationSchema = z.object({
  eventId: uuid,
  trackId: uuid.optional(),
});
export const scoreSchema = z.object({
  assignmentId: uuid,
  rubricScoresJson: z.record(z.number().finite()),
  comment: z.string().max(5000).optional(),
});
export const pairwiseSchema = z.object({
  winnerSubmissionId: uuid,
  loserSubmissionId: uuid,
});
export const scoreClearSchema = z.object({ assignmentId: uuid });
export const flagReasonSchema = z.enum([
  'PLAGIARISM',
  'OFF_TOPIC',
  'INCOMPLETE',
  'INAPPROPRIATE',
  'OTHER',
]);
export const flagSchema = z.object({
  assignmentId: uuid,
  reason: flagReasonSchema,
  comment: z.string().trim().max(1000).optional(),
});
export const unflagSchema = z.object({ assignmentId: uuid });
