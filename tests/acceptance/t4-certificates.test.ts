import { beforeEach, describe, expect, it, vi } from 'vitest'

// Tier 4.7: certificate PDFs (rendered live via pdfkit — no need to mock it,
// it's pure in-memory binary generation) + their signed envelopes. Same
// layered-mock convention as t4-records.test.ts: mock ../../src/db (with a
// per-call result queue) + crypto/keys + the other services
// certificate-service.ts calls into.
const hoisted = vi.hoisted(() => {
  const { generateKeyPairSync } = require('node:crypto') as typeof import('node:crypto')
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const pemPublic = publicKey.export({ type: 'spki', format: 'pem' }) as string
  const pemPrivate = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  const keyStore = new Map<string, { kid: string; publicKeyPem: string }>([['test-kid', { kid: 'test-kid', publicKeyPem: pemPublic }]])

  const state = { selectQueue: [] as unknown[][], selectIndex: 0, getEffectiveRole: null as any, getEventRow: null as any, recordAuditLog: null as any }

  function nextSelect() {
    const rows = state.selectQueue[state.selectIndex] ?? []
    state.selectIndex++
    const p: any = Promise.resolve(rows)
    for (const method of ['from', 'where', 'limit', 'innerJoin', 'orderBy']) p[method] = () => p
    return p
  }

  return { pemPublic, pemPrivate, keyStore, state, nextSelect }
})

vi.mock('../../src/db', () => ({ db: { select: () => hoisted.nextSelect() } }))
vi.mock('../../src/server/crypto/keys', () => ({
  getSigningKeyPair: vi.fn(async () => ({ kid: 'test-kid', publicKey: hoisted.pemPublic, privateKey: hoisted.pemPrivate })),
  findSigningKeyRow: vi.fn(async (kid: string) => hoisted.keyStore.get(kid) ?? null),
}))
vi.mock('../../src/server/auth-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/server/auth-service')>()
  return { ...actual, getEffectiveRole: (...args: unknown[]) => hoisted.state.getEffectiveRole(...args) }
})
vi.mock('../../src/server/event-service', () => ({ getEventRow: (...args: unknown[]) => hoisted.state.getEventRow(...args) }))
vi.mock('../../src/server/audit-service', () => ({ recordAuditLog: (...args: unknown[]) => hoisted.state.recordAuditLog(...args) }))

import { verifyEnvelope } from '../../src/server/signing-service'
import { generateParticipantCertificate } from '../../src/server/certificate-service'

function fakeUser(overrides: Partial<{ id: string; role: string }> = {}) {
  return { id: overrides.id ?? 'user-1', role: overrides.role ?? 'PARTICIPANT' } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.state.selectQueue = []
  hoisted.state.selectIndex = 0
  hoisted.state.getEffectiveRole = vi.fn(async () => 'PARTICIPANT')
  hoisted.state.getEventRow = vi.fn(async () => ({ id: 'evt-1', title: 'Sample Hack' }))
  hoisted.state.recordAuditLog = vi.fn(async () => undefined)
})

describe('T4 participant certificate: PDF + signed envelope', () => {
  it('renders a real PDF and a verifiable, email-free envelope', async () => {
    hoisted.state.selectQueue = [
      [{ id: 'sub-1', teamId: 'team-1', title: 'Cool Project', submittedAt: new Date('2026-01-01') }],
      [{ id: 'team-1', eventId: 'evt-1', name: 'Team Rocket' }],
      [{ id: 'membership-1', teamId: 'team-1', userId: 'user-1', role: 'MEMBER' }],
      [{ id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' }],
    ]
    const { pdf, envelope } = await generateParticipantCertificate(fakeUser({ id: 'user-1' }), 'evt-1', 'sub-1')

    // pdfkit's real binary output — not a mock, so this proves an actual PDF came out.
    expect(pdf.subarray(0, 7).toString('latin1')).toBe('%PDF-1.')
    expect(pdf.subarray(-6).toString('latin1').trim()).toBe('%%EOF')

    expect(envelope.type).toBe('certificate')
    const payload = envelope.payload as Record<string, unknown>
    expect(payload).toMatchObject({ recipientUserId: 'user-1', recipientName: 'Ada Lovelace', role: 'PARTICIPANT' })
    // The property being protected: no email or other contact PII leaves
    // this function, since the envelope is designed to be shared/verified
    // by anyone via /verify.
    expect(payload).not.toHaveProperty('email')
    expect(payload).not.toHaveProperty('recipientEmail')

    const verified = await verifyEnvelope(envelope)
    expect(verified.valid).toBe(true)
  })

  it('never falls back to email when no display name is set (regression: this used to leak the email into recipientName)', async () => {
    hoisted.state.selectQueue = [
      [{ id: 'sub-1', teamId: 'team-1', title: 'Cool Project', submittedAt: new Date('2026-01-01') }],
      [{ id: 'team-1', eventId: 'evt-1', name: 'Team Rocket' }],
      [{ id: 'membership-1', teamId: 'team-1', userId: 'user-1', role: 'MEMBER' }],
      [{ id: 'user-1', name: null, firstName: null, lastName: null, email: 'leaky@example.com' }],
    ]
    const { envelope } = await generateParticipantCertificate(fakeUser({ id: 'user-1' }), 'evt-1', 'sub-1')
    const payload = envelope.payload as Record<string, unknown>
    expect(payload.recipientName).toBe('A participant')
    expect(payload.recipientName).not.toContain('leaky')
    expect(payload.recipientName).not.toContain('@')
  })

  it('falls back to firstName + lastName when the combined name field is unset', async () => {
    hoisted.state.selectQueue = [
      [{ id: 'sub-1', teamId: 'team-1', title: 'Cool Project', submittedAt: new Date('2026-01-01') }],
      [{ id: 'team-1', eventId: 'evt-1', name: 'Team Rocket' }],
      [{ id: 'membership-1', teamId: 'team-1', userId: 'user-1', role: 'MEMBER' }],
      [{ id: 'user-1', name: null, firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' }],
    ]
    const { envelope } = await generateParticipantCertificate(fakeUser({ id: 'user-1' }), 'evt-1', 'sub-1')
    const payload = envelope.payload as Record<string, unknown>
    expect(payload.recipientName).toBe('Grace Hopper')
  })

  it('refuses a draft (unfinalized) submission', async () => {
    hoisted.state.selectQueue = [
      [{ id: 'sub-1', teamId: 'team-1', title: 'Cool Project', submittedAt: null }],
      [{ id: 'team-1', eventId: 'evt-1', name: 'Team Rocket' }],
      [{ id: 'membership-1', teamId: 'team-1', userId: 'user-1', role: 'MEMBER' }],
      [{ id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' }],
    ]
    await expect(generateParticipantCertificate(fakeUser({ id: 'user-1' }), 'evt-1', 'sub-1')).rejects.toMatchObject({
      code: 'SUBMISSION_NOT_FINALIZED',
      status: 409,
    })
  })

  it("403s a non-member/non-organizer requesting someone else's certificate", async () => {
    hoisted.state.getEffectiveRole.mockResolvedValue('PARTICIPANT')
    hoisted.state.selectQueue = [
      [{ id: 'sub-1', teamId: 'team-1', title: 'Cool Project', submittedAt: new Date('2026-01-01') }],
      [{ id: 'team-1', eventId: 'evt-1', name: 'Team Rocket' }],
    ]
    await expect(
      generateParticipantCertificate(fakeUser({ id: 'user-2' }), 'evt-1', 'sub-1', 'user-1'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
  })
})
