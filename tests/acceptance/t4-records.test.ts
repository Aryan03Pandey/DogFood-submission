import { beforeEach, describe, expect, it, vi } from 'vitest'

// Tier 4.6: signed judge records (aggregate-only participation attestation)
// and the public results manifest. Fully DB-free, same layered-mock
// convention as t4-export-signing.test.ts (mock ../../src/db + crypto/keys)
// plus mocking the other services records-service.ts calls into
// (auth-service/event-service/assignment-service/audit-service), rather than
// their internal queries.
const hoisted = vi.hoisted(() => {
  const { generateKeyPairSync } = require('node:crypto') as typeof import('node:crypto')
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const pemPublic = publicKey.export({ type: 'spki', format: 'pem' }) as string
  const pemPrivate = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  const keyStore = new Map<string, { kid: string; publicKeyPem: string }>([['test-kid', { kid: 'test-kid', publicKeyPem: pemPublic }]])

  const state = { selectQueue: [] as unknown[][], selectIndex: 0, getEffectiveRole: null as any, getEventRow: null as any, getPublishedRankings: null as any, recordAuditLog: null as any }

  function nextSelect() {
    const rows = state.selectQueue[state.selectIndex] ?? []
    state.selectIndex++
    const p: any = Promise.resolve(rows)
    for (const method of ['from', 'where', 'limit', 'innerJoin', 'groupBy', 'orderBy']) p[method] = () => p
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
vi.mock('../../src/server/assignment-service', () => ({ getPublishedRankings: (...args: unknown[]) => hoisted.state.getPublishedRankings(...args) }))
vi.mock('../../src/server/audit-service', () => ({ recordAuditLog: (...args: unknown[]) => hoisted.state.recordAuditLog(...args) }))

import { AuthError } from '../../src/server/auth-service'
import { verifyEnvelope } from '../../src/server/signing-service'
import { getJudgeRecord, getResultsManifest } from '../../src/server/records-service'

function fakeUser(overrides: Partial<{ id: string; role: string }> = {}) {
  return { id: overrides.id ?? 'judge-1', role: overrides.role ?? 'JUDGE' } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.state.selectQueue = []
  hoisted.state.selectIndex = 0
  hoisted.state.getEffectiveRole = vi.fn(async () => 'PARTICIPANT')
  hoisted.state.getEventRow = vi.fn(async () => ({ id: 'evt-1', title: 'Sample Hack', status: 'PUBLISHED' }))
  hoisted.state.getPublishedRankings = vi.fn(async () => [])
  hoisted.state.recordAuditLog = vi.fn(async () => undefined)
})

describe('T4 judge records: aggregate-only, never scores', () => {
  it('round-trips through real signEnvelope/verifyEnvelope and contains no score/comment data', async () => {
    hoisted.state.selectQueue = [
      [{ id: 'judge-1', name: 'Ada Judge' }],
      [{ assignedCount: 5 }],
      [{ completedCount: 3, firstScoredAt: new Date('2026-01-01'), lastScoredAt: new Date('2026-01-02') }],
    ]
    const envelope = await getJudgeRecord(fakeUser({ id: 'judge-1' }), 'evt-1', 'judge-1')
    expect(envelope.type).toBe('judge-record')
    const payload = envelope.payload as Record<string, unknown>
    expect(payload).toMatchObject({ eventId: 'evt-1', judgeId: 'judge-1', judgeName: 'Ada Judge', assignedCount: 5, completedCount: 3 })
    // The property being protected: no rubric scores, comments, or per-
    // assignment/submission identifiers ever leave this function.
    expect(payload).not.toHaveProperty('rubricScoresJson')
    expect(payload).not.toHaveProperty('rawTotal')
    expect(payload).not.toHaveProperty('comment')
    expect(payload).not.toHaveProperty('submissionId')
    expect(payload).not.toHaveProperty('assignmentId')

    const verified = await verifyEnvelope(envelope)
    expect(verified.valid).toBe(true)
  })

  it("403s a different judge requesting someone else's record", async () => {
    hoisted.state.getEffectiveRole.mockResolvedValue('JUDGE')
    await expect(getJudgeRecord(fakeUser({ id: 'judge-2' }), 'evt-1', 'judge-1')).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
  })

  it("allows the event's organizer to view a judge's record", async () => {
    hoisted.state.getEffectiveRole.mockResolvedValue('ORGANIZER')
    hoisted.state.selectQueue = [[{ id: 'judge-1', name: 'Ada Judge' }], [{ assignedCount: 0 }], [{ completedCount: 0, firstScoredAt: null, lastScoredAt: null }]]
    const envelope = await getJudgeRecord(fakeUser({ id: 'organizer-1', role: 'PARTICIPANT' }), 'evt-1', 'judge-1')
    expect(envelope.type).toBe('judge-record')
  })
})

describe('T4 results manifest: public, gated on PUBLISHED', () => {
  it('409s before the event is PUBLISHED, with no auth check performed at all', async () => {
    // deriveEventStatus derives purely from timestamps (not the stored
    // `status` string) — publicVotingEndTime in the future keeps this event
    // in PUBLIC_VOTING, one phase short of PUBLISHED.
    hoisted.state.getEventRow.mockResolvedValue({
      id: 'evt-1',
      title: 'Sample Hack',
      status: 'PUBLIC_VOTING',
      registrationEnd: null,
      submissionDeadline: null,
      judgingStart: null,
      judgingEndTime: null,
      publicVotingStart: null,
      publicVotingEndTime: new Date(Date.now() + 60_000),
    })
    await expect(getResultsManifest('evt-1')).rejects.toBeInstanceOf(AuthError)
    await expect(getResultsManifest('evt-1')).rejects.toMatchObject({ code: 'RESULTS_NOT_PUBLISHED', status: 409 })
  })

  it('succeeds with no auth header/actor once PUBLISHED, verifies, and includes vote totals', async () => {
    hoisted.state.getPublishedRankings.mockResolvedValue([
      { submissionId: 'sub-1', title: 'Cool Project', teamName: 'Team A', scoreCount: 2, raw: 8.5, zScore: 1.2, minMax: 0.9, trimmedMean: 8.4 },
    ])
    hoisted.state.selectQueue = [[{ submissionId: 'sub-1', total: 12 }]]
    const envelope = await getResultsManifest('evt-1')
    expect(envelope.type).toBe('results-manifest')
    const payload = envelope.payload as any
    expect(payload.rankings[0]).toMatchObject({ submissionId: 'sub-1', totalVotes: 12 })
    expect(hoisted.state.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'results_manifest.generated', entityId: 'evt-1' }),
    )
    const verified = await verifyEnvelope(envelope)
    expect(verified.valid).toBe(true)
  })
})
