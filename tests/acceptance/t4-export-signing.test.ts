import { beforeEach, describe, expect, it, vi } from 'vitest'

// Every export is signed, and import verifies+unwraps it — this is the core
// of the "export -> tamper -> /verify fails -> import refuses" demo
// sequence. Fully mocked (db + crypto/keys, the exact pattern
// tests/acceptance/t4-signing.test.ts and t4-import-atomicity.test.ts
// already use separately) so this runs with no live database or filesystem.
const hoisted = vi.hoisted(() => {
  const { generateKeyPairSync } = require('node:crypto') as typeof import('node:crypto')
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const pemPublic = publicKey.export({ type: 'spki', format: 'pem' }) as string
  const pemPrivate = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  const store = new Map<string, { kid: string; publicKeyPem: string }>([['test-kid', { kid: 'test-kid', publicKeyPem: pemPublic }]])

  function emptySelect(): any {
    const p: any = Promise.resolve([])
    for (const method of ['from', 'where', 'limit', 'orderBy', 'innerJoin']) p[method] = () => p
    return p
  }
  function insertBuilder(): any {
    return {
      values: () => {
        const p: any = Promise.resolve(undefined)
        p.onConflictDoNothing = () => Promise.resolve([])
        p.onConflictDoUpdate = () => Promise.resolve([])
        p.returning = () => Promise.resolve([])
        return p
      },
    }
  }
  const transaction = { fn: null as any }

  return { pemPublic, pemPrivate, store, emptySelect, insertBuilder, transaction }
})

vi.mock('../../src/db', () => ({
  db: {
    select: hoisted.emptySelect,
    insert: hoisted.insertBuilder,
    transaction: (cb: (tx: unknown) => unknown) => hoisted.transaction.fn(cb),
  },
}))
vi.mock('../../src/server/crypto/keys', () => ({
  getSigningKeyPair: vi.fn(async () => ({ kid: 'test-kid', publicKey: hoisted.pemPublic, privateKey: hoisted.pemPrivate })),
  findSigningKeyRow: vi.fn(async (kid: string) => hoisted.store.get(kid) ?? null),
}))

import { exportInstance } from '../../src/server/export-service'
import { importData, ImportError } from '../../src/server/import-service'

beforeEach(() => {
  hoisted.transaction.fn = vi.fn(async (cb: (tx: unknown) => unknown) => cb({ insert: hoisted.insertBuilder, select: hoisted.emptySelect }))
})

describe('T4 export produces a signed envelope', () => {
  it('wraps the export in a dogfood-signed / type:export envelope', async () => {
    const signed = await exportInstance()
    expect(signed.format).toBe('dogfood-signed')
    expect(signed.type).toBe('export')
    expect(signed.kid).toBe('test-kid')
    expect(typeof signed.signature).toBe('string')
    expect(signed.payload.format).toBe('dogfood-export')
    expect(signed.payload.scope).toBe('instance')
  })
})

describe('T4 import accepts/rejects signed exports', () => {
  it('accepts a validly-signed export and reaches the transaction', async () => {
    const signed = await exportInstance()
    const summary = await importData(signed, { force: true })
    expect(summary.dryRun).toBe(false)
    expect(hoisted.transaction.fn).toHaveBeenCalledTimes(1)
  })

  it('rejects a tampered signed export with INVALID_SIGNATURE, before ever opening a transaction', async () => {
    const signed = await exportInstance()
    const tampered = { ...signed, payload: { ...signed.payload, scope: 'event' as const } }
    await expect(importData(tampered, { force: true })).rejects.toMatchObject({
      code: 'INVALID_SIGNATURE',
    })
    expect(hoisted.transaction.fn).not.toHaveBeenCalled()
  })

  it('still accepts a legacy, unsigned envelope (backward compatible)', async () => {
    const signed = await exportInstance()
    const unsigned = signed.payload // the plain ExportEnvelope, no dogfood-signed wrapper
    const summary = await importData(unsigned, { force: true })
    expect(summary.dryRun).toBe(false)
    expect(hoisted.transaction.fn).toHaveBeenCalledTimes(1)
  })

  it('rejects a tampered envelope even instance-wide (not just a schema check)', async () => {
    const signed = await exportInstance()
    // A byte-for-byte identical clone still verifies; any change anywhere in
    // .payload must invalidate the signature.
    const clone = JSON.parse(JSON.stringify(signed))
    expect((await importData(clone, { force: true })).dryRun).toBe(false)

    const brokenSignature = { ...signed, signature: signed.signature.slice(0, -4) + 'abcd' }
    await expect(importData(brokenSignature, { force: true })).rejects.toBeInstanceOf(ImportError)
  })
})
