import { describe, expect, it, vi } from 'vitest'

// Separate file from t4-export-import.test.ts on purpose: that file's gated
// live-DB block needs the REAL '../../src/db', and a file-level mock of it
// here would apply to every importer within this file's module graph
// (including transitively, through import-service.ts's own `import { db }`),
// which would silently break that block. Isolating the mock to its own file
// avoids the conflict entirely.
const hoisted = vi.hoisted(() => ({
  transaction: vi.fn((_cb: (tx: unknown) => unknown): Promise<unknown> => {
    throw new Error('db.transaction was called — validation should have rejected this payload before any DB write')
  }),
}))
vi.mock('../../src/db', () => {
  // A minimal self-chaining thenable: isInstanceEmpty() calls
  // .select(...).from(t).limit(1) and, separately, .select(...).from(events)
  // with no further chaining — both need to resolve to an empty array.
  function emptySelect(): any {
    const p: any = Promise.resolve([])
    p.from = () => p
    p.where = () => p
    p.limit = () => p
    return p
  }
  const insert = () => ({ values: () => Promise.resolve(undefined) })
  return { db: { transaction: hoisted.transaction, select: emptySelect, insert } }
})

import { importData } from '../../src/server/import-service'

const validUser = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  email: 'a@local',
  name: null,
  firstName: null,
  lastName: null,
  countryCode: null,
  phoneNumber: null,
  profession: null,
  country: null,
  skills: [],
  linkedinUrl: null,
  githubUrl: null,
  profileComplete: false,
  role: 'PARTICIPANT',
  organization: null,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function envelopeWithUsers(users: unknown[]) {
  return {
    format: 'dogfood-export',
    version: 1,
    exported_at: '2026-01-01T00:00:00.000Z',
    scope: 'instance',
    data: {
      users,
      user_projects: [],
      event_roles: [],
      events: [],
      tracks: [],
      prizes: [],
      teams: [],
      team_members: [],
      submissions: [],
      rubrics: [],
      judge_tracks: [],
      conflicts_of_interest: [],
      judge_assignments: [],
      scores: [],
      pairwise_comparisons: [],
      votes: [],
      prize_awards: [],
      audit_logs: [],
      signing_keys: [],
    },
  }
}

describe('T4 import atomicity: validation happens before any DB write', () => {
  it('rejects a payload where one row (among many valid ones) is structurally invalid, before ever opening a transaction', async () => {
    const payload = envelopeWithUsers([
      validUser,
      { ...validUser, id: 'not-a-valid-uuid' }, // the "bad row in the middle of the file"
      { ...validUser, id: '223e4567-e89b-12d3-a456-426614174001' },
    ])

    await expect(importData(payload)).rejects.toThrow()
    expect(hoisted.transaction).not.toHaveBeenCalled()
  })

  it('rejects an entirely malformed payload (not even the right envelope shape) before touching the DB', async () => {
    await expect(importData({ nonsense: true })).rejects.toThrow()
    await expect(importData(null)).rejects.toThrow()
    expect(hoisted.transaction).not.toHaveBeenCalled()
  })

  it('accepts a fully valid payload and does reach the transaction (sanity check the mock)', async () => {
    hoisted.transaction.mockImplementationOnce(async (cb) => {
      // A minimal fake tx sufficient for an all-empty-tables import.
      const noop = () => ({ values: () => ({ onConflictDoNothing: async () => [], onConflictDoUpdate: async () => [] }) })
      return cb({ insert: noop })
    })
    const result = await importData(envelopeWithUsers([]))
    expect(hoisted.transaction).toHaveBeenCalledTimes(1)
    expect(result.counts.users).toBe(0)
  })
})
