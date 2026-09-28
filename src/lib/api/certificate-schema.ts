import { z } from 'zod'
import { uuidSchema } from './schemas'

// Tier 4.7.
export const awardPrizeRequestSchema = z.object({
  prizeId: uuidSchema,
  submissionId: uuidSchema,
})
