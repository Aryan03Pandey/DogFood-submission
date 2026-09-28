import { sign as cryptoSign, verify as cryptoVerify, createPrivateKey, createPublicKey } from 'node:crypto'
import { canonicalize } from '../lib/canonical-json'
import { findSigningKeyRow, getSigningKeyPair } from './crypto/keys'

export const ENVELOPE_FORMAT = 'dogfood-signed'
export const ENVELOPE_VERSION = 1

export type EnvelopeType = 'results-manifest' | 'judge-record' | 'certificate' | 'export'

export interface SignedEnvelope {
  format: typeof ENVELOPE_FORMAT
  version: typeof ENVELOPE_VERSION
  type: EnvelopeType
  alg: 'Ed25519'
  kid: string
  signed_at: string
  payload: unknown
  signature: string
}

// Every field except `signature` itself is covered by the signature, so
// `type` and `kid` can't be swapped on a signed envelope after the fact.
function signableBytes(envelope: Omit<SignedEnvelope, 'signature'>): Buffer {
  return Buffer.from(canonicalize(envelope), 'utf8')
}

export async function signEnvelope(type: EnvelopeType, payload: unknown): Promise<SignedEnvelope> {
  const { kid, privateKey } = await getSigningKeyPair()
  const unsigned: Omit<SignedEnvelope, 'signature'> = {
    format: ENVELOPE_FORMAT,
    version: ENVELOPE_VERSION,
    type,
    alg: 'Ed25519',
    kid,
    signed_at: new Date().toISOString(),
    payload,
  }
  const signature = cryptoSign(null, signableBytes(unsigned), createPrivateKey(privateKey)).toString('base64url')
  return { ...unsigned, signature }
}

export interface VerifyResult {
  valid: boolean
  kid?: string
  type?: string
  reason?: string
}

export async function verifyEnvelope(input: unknown): Promise<VerifyResult> {
  if (!isPlainObject(input)) return { valid: false, reason: 'NOT_AN_OBJECT' }
  const envelope = input as Partial<SignedEnvelope>
  if (envelope.format !== ENVELOPE_FORMAT) return { valid: false, reason: 'UNKNOWN_FORMAT' }
  if (envelope.version !== ENVELOPE_VERSION) return { valid: false, reason: 'UNKNOWN_VERSION' }
  if (typeof envelope.kid !== 'string' || typeof envelope.signature !== 'string') {
    return { valid: false, reason: 'MALFORMED_ENVELOPE' }
  }

  const row = await findSigningKeyRow(envelope.kid)
  if (!row) return { valid: false, kid: envelope.kid, reason: 'UNKNOWN_KID' }

  const { signature, ...unsigned } = envelope as SignedEnvelope
  let bytes: Buffer
  try {
    bytes = signableBytes(unsigned)
  } catch {
    return { valid: false, kid: envelope.kid, reason: 'MALFORMED_PAYLOAD' }
  }

  const ok = cryptoVerify(
    null,
    bytes,
    createPublicKey(row.publicKeyPem),
    Buffer.from(signature, 'base64url'),
  )
  if (!ok) return { valid: false, kid: envelope.kid, type: envelope.type, reason: 'BAD_SIGNATURE' }
  // A retired key still verifies signatures it issued before retirement —
  // retirement only stops *new* signing, checked in signEnvelope's key
  // selection (getSigningKeyPair always returns the current, non-retired key).
  return { valid: true, kid: envelope.kid, type: envelope.type }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
