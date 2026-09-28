import { beforeAll, describe, expect, it, vi } from 'vitest'
import { canonicalize } from '../../src/lib/canonical-json'

// Fully DB-free: src/server/crypto/keys.ts is the only module that ever
// touches signing_keys/Postgres (see its own comment), so mocking its two
// exports here is enough to exercise signing-service.ts's actual
// canonicalization + Ed25519 sign/verify logic with no live database.
//
// generateKeyPairSync is required (not imported) inside vi.hoisted: vitest
// rewrites every top-level import in a file that calls vi.mock into a lazy
// binding not yet initialized this early, so a plain `import` cannot be
// referenced from here — only Node's synchronous `require` can.
const hoisted = vi.hoisted(() => {
  const { generateKeyPairSync } = require('node:crypto') as typeof import('node:crypto')
  const keyA = generateKeyPairSync('ed25519')
  const keyB = generateKeyPairSync('ed25519')
  const pemA = {
    public: keyA.publicKey.export({ type: 'spki', format: 'pem' }) as string,
    private: keyA.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  }
  const pemB = {
    public: keyB.publicKey.export({ type: 'spki', format: 'pem' }) as string,
    private: keyB.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  }
  const store = new Map<string, { kid: string; publicKeyPem: string }>([
    ['kid-a', { kid: 'kid-a', publicKeyPem: pemA.public }],
    ['kid-b-retired', { kid: 'kid-b-retired', publicKeyPem: pemB.public }],
  ])
  return { pemA, pemB, store }
})

vi.mock('../../src/server/crypto/keys', () => ({
  getSigningKeyPair: vi.fn(async () => ({ kid: 'kid-a', publicKey: hoisted.pemA.public, privateKey: hoisted.pemA.private })),
  findSigningKeyRow: vi.fn(async (kid: string) => hoisted.store.get(kid) ?? null),
  listPublicKeys: vi.fn(async () =>
    [...hoisted.store.values()].map((row) => ({ ...row, createdAt: new Date('2026-01-01'), retiredAt: null })),
  ),
}))

// tsconfig's target (ES6) doesn't allow top-level await, so these load in a
// beforeAll instead of at module scope.
let getSigningKeyPair: typeof import('../../src/server/crypto/keys').getSigningKeyPair
let signEnvelope: typeof import('../../src/server/signing-service').signEnvelope
let verifyEnvelope: typeof import('../../src/server/signing-service').verifyEnvelope

beforeAll(async () => {
  ;({ getSigningKeyPair } = await import('../../src/server/crypto/keys'))
  ;({ signEnvelope, verifyEnvelope } = await import('../../src/server/signing-service'))
})

describe('T4 canonical-json', () => {
  it('is stable regardless of key insertion order', () => {
    const a = { z: 1, a: { d: 4, c: 3 }, m: [3, 1, 2] }
    const b = { m: [3, 1, 2], a: { c: 3, d: 4 }, z: 1 }
    expect(canonicalize(a)).toBe(canonicalize(b))
    expect(canonicalize(a)).toBe('{"a":{"c":3,"d":4},"m":[3,1,2],"z":1}')
  })

  it.each([
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a function', () => {}],
    ['a BigInt', BigInt(1)],
  ])('throws on %s', (_label, value) => {
    expect(() => canonicalize({ bad: value })).toThrow()
  })

  it('sorts unicode keys the same way regardless of insertion order', () => {
    const values: Record<string, number> = { café: 1, æther: 2, ホテル: 3, apple: 4 }
    const a = { ...values }
    const b = Object.fromEntries([...Object.entries(values)].reverse())
    expect(canonicalize(a)).toBe(canonicalize(b))
    // The exact order is whatever JS's default (UTF-16 code unit) string
    // sort produces — asserted against Object.keys(...).sort() directly so
    // this test documents actual behavior rather than an assumed standard.
    const expectedOrder = Object.keys(values).sort()
    const expectedJson = `{${expectedOrder.map((k) => `${JSON.stringify(k)}:${values[k]}`).join(',')}}`
    expect(canonicalize(a)).toBe(expectedJson)
  })

  it('canonicalizes deeply nested arrays and objects', () => {
    const value = { list: [{ a: [1, [2, 3], { b: 4 }] }, [5, 6]] }
    expect(canonicalize(value)).toBe('{"list":[{"a":[1,[2,3],{"b":4}]},[5,6]]}')
  })

  it('serializes -0 the same as 0 (matches JSON.stringify, per RFC 8785)', () => {
    expect(canonicalize({ n: -0 })).toBe('{"n":0}')
    expect(canonicalize({ n: -0 })).toBe(canonicalize({ n: 0 }))
  })

  it('is deterministic for large numbers, whatever double-precision does to them', () => {
    // IEEE-754 doubles can't represent this exactly; canonicalize doesn't
    // claim to fix that (rawTotal/cashValue-style fields in this app are
    // nowhere near this range) — what matters is it never throws and always
    // produces the same bytes for the same input.
    const huge = 12345678901234567890
    expect(() => canonicalize({ n: huge })).not.toThrow()
    expect(canonicalize({ n: huge })).toBe(canonicalize({ n: huge }))
    expect(canonicalize({ n: huge })).toBe(`{"n":${JSON.stringify(huge)}}`)
  })
})

describe('T4 Ed25519 signing core', () => {
  it('signs and verifies a round trip', async () => {
    const envelope = await signEnvelope('export', { hello: 'world' })
    expect(envelope.format).toBe('dogfood-signed')
    expect(envelope.kid).toBe('kid-a')
    const result = await verifyEnvelope(envelope)
    expect(result).toMatchObject({ valid: true, kid: 'kid-a', type: 'export' })
  })

  it('rejects a tampered payload', async () => {
    const envelope = await signEnvelope('results-manifest', { rank: 1 })
    const tampered = { ...envelope, payload: { rank: 999 } }
    expect(await verifyEnvelope(tampered)).toMatchObject({ valid: false, reason: 'BAD_SIGNATURE' })
  })

  it('rejects a swapped type', async () => {
    const envelope = await signEnvelope('certificate', { name: 'Ada' })
    const swapped = { ...envelope, type: 'judge-record' }
    expect(await verifyEnvelope(swapped)).toMatchObject({ valid: false, reason: 'BAD_SIGNATURE' })
  })

  it('rejects an unknown kid', async () => {
    const envelope = await signEnvelope('export', { a: 1 })
    const forged = { ...envelope, kid: 'no-such-kid' }
    expect(await verifyEnvelope(forged)).toMatchObject({ valid: false, kid: 'no-such-kid', reason: 'UNKNOWN_KID' })
  })

  it('still verifies an envelope from a retired key', async () => {
    vi.mocked(getSigningKeyPair).mockResolvedValueOnce({
      kid: 'kid-b-retired',
      publicKey: hoisted.pemB.public,
      privateKey: hoisted.pemB.private,
    })
    const envelope = await signEnvelope('judge-record', { participated: true })
    // findSigningKeyRow resolves by kid alone — retirement stops future
    // signing (getSigningKeyPair would simply stop returning that kid), not
    // verification of what it already signed.
    expect(await verifyEnvelope(envelope)).toMatchObject({ valid: true, kid: 'kid-b-retired' })
  })

  it('rejects a malformed envelope without throwing', async () => {
    expect(await verifyEnvelope(null)).toMatchObject({ valid: false, reason: 'NOT_AN_OBJECT' })
    expect(await verifyEnvelope({ format: 'something-else' })).toMatchObject({ valid: false, reason: 'UNKNOWN_FORMAT' })
    expect(await verifyEnvelope({ format: 'dogfood-signed', version: 2 })).toMatchObject({
      valid: false,
      reason: 'UNKNOWN_VERSION',
    })
  })
})

describe('T4 GET /api/keys', () => {
  it('never contains private key material, only public PEMs and metadata', async () => {
    const { GET } = await import('../../app/api/keys/route')
    const res = await GET(new Request('http://localhost/api/keys'))
    expect(res.status).toBe(200)
    const bodyText = await res.text()
    expect(bodyText).not.toContain('PRIVATE KEY')
    expect(bodyText).toContain('PUBLIC KEY')
    const body = JSON.parse(bodyText)
    expect(body.keys.length).toBeGreaterThan(0)
    for (const key of body.keys) {
      expect(Object.keys(key).sort()).toEqual(['createdAt', 'kid', 'publicKeyPem', 'retiredAt', 'status'].sort())
    }
  })
})

describe('T4 POST /api/verify (route level)', () => {
  // Deliberate design choice, not an oversight: the route always answers
  // 200 with { valid, reason } — including for a malformed envelope — rather
  // than 422, so a checker/script gets one consistent shape to parse
  // regardless of what it posted. verifyEnvelope (tested above) is what
  // decides valid:false; the route just relays it.
  it('answers 200 with valid:false for a malformed body, never 422', async () => {
    const { POST } = await import('../../app/api/verify/route')
    const res = await POST(
      new Request('http://localhost/api/verify', {
        method: 'POST',
        body: JSON.stringify({ not: 'an envelope' }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ valid: false, reason: 'UNKNOWN_FORMAT' })
  })

  it('answers 200 with valid:false for an unparsable (non-JSON) body', async () => {
    const { POST } = await import('../../app/api/verify/route')
    const res = await POST(
      new Request('http://localhost/api/verify', { method: 'POST', body: 'not json at all' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ valid: false, reason: 'NOT_AN_OBJECT' })
  })

  it('answers 200 with valid:false for a bad signature', async () => {
    const envelope = await signEnvelope('export', { a: 1 })
    const tampered = { ...envelope, payload: { a: 2 } }
    const { POST } = await import('../../app/api/verify/route')
    const res = await POST(
      new Request('http://localhost/api/verify', {
        method: 'POST',
        body: JSON.stringify(tampered),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ valid: false, reason: 'BAD_SIGNATURE' })
  })
})
