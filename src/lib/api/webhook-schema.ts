import { z } from 'zod'

// Tier 4.5.
export const registerWebhookRequestSchema = z.object({
  url: z.string().url(),
})
