import { z } from 'zod'

// Shared shape of every signed envelope this app produces (src/server/
// signing-service.ts's SignedEnvelope) — factored out once every
// EnvelopeType ('export', then 'judge-record'/'results-manifest'/
// 'certificate') needed the same seven wrapper fields, so a caller isn't
// re-typing format/version/alg/kid/signed_at/signature per envelope type.
export function signedEnvelopeSchema<Type extends string, Payload extends z.ZodTypeAny>(
  type: Type,
  payloadSchema: Payload,
) {
  return z.object({
    format: z.literal('dogfood-signed'),
    version: z.literal(1),
    type: z.literal(type),
    alg: z.literal('Ed25519'),
    kid: z.string(),
    signed_at: z.string(),
    payload: payloadSchema,
    signature: z.string(),
  })
}
