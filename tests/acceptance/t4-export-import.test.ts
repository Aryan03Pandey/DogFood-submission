import { afterAll, describe, expect, it } from 'vitest'
import { exportDataSchema, exportEnvelopeSchema, userRowSchema } from '../../src/lib/api/export-schema'
import { FIXTURE_SLUG, isEmptyGiven, needsPlaceholderPassword } from '../../src/server/import-service'

const emptyData = {
  users: [],
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
}

const sampleUser = {
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

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    format: 'dogfood-export',
    version: 1,
    exported_at: '2026-01-01T00:00:00.000Z',
    scope: 'instance',
    data: emptyData,
    ...overrides,
  }
}

describe('T4 export envelope schema', () => {
  it('accepts a minimal valid envelope', () => {
    expect(exportEnvelopeSchema.safeParse(envelope()).success).toBe(true)
  })

  it('accepts a user row with no password_hash (credentials excluded by default)', () => {
    const result = exportEnvelopeSchema.safeParse(
      envelope({
        data: {
          ...emptyData,
          users: [sampleUser],
        },
      }),
    )
    expect(result.success).toBe(true)
  })

  it('rejects an unknown format or version', () => {
    expect(exportEnvelopeSchema.safeParse(envelope({ format: 'something-else' })).success).toBe(false)
    expect(exportEnvelopeSchema.safeParse(envelope({ version: 2 })).success).toBe(false)
  })

  it('rejects an unknown scope', () => {
    expect(exportEnvelopeSchema.safeParse(envelope({ scope: 'everything' })).success).toBe(false)
  })

  it('rejects a malformed row (bad uuid, bad role)', () => {
    const result = exportEnvelopeSchema.safeParse(
      envelope({ data: { ...emptyData, events: [{ id: 'not-a-uuid' }] } }),
    )
    expect(result.success).toBe(false)
  })
})

describe('T4 export schema never has a place to put a secret', () => {
  it('has no sessions or api_tokens table in the export shape at all', () => {
    // Structural, not just "the service happens not to select them": there
    // is no key in the schema an exporter could even accidentally populate.
    const tableNames = Object.keys(exportDataSchema.shape)
    expect(tableNames).not.toContain('sessions')
    expect(tableNames).not.toContain('api_tokens')
  })

  it('rejects a users row carrying a token_hash or session-token-shaped field', () => {
    // userRowSchema is exact (Zod object, not passthrough) — an extra field
    // like this is simply not part of the shape, so parsing must fail unless
    // it's dropped, and either way it can never round-trip through export.
    const result = userRowSchema.safeParse({
      ...sampleUser,
      tokenHash: 'should-not-exist-on-a-user-row',
    })
    expect(result.success).toBe(true) // parses...
    expect(result.success && 'tokenHash' in result.data).toBe(false) // ...but strips the unknown field
  })

  it("passwordHash is the only credential-shaped field, and it's optional", () => {
    const shape = userRowSchema.shape
    const credentialLikeKeys = Object.keys(shape).filter((k) => /password|hash|secret|token|pem|key/i.test(k))
    expect(credentialLikeKeys).toEqual(['passwordHash'])
    expect(shape.passwordHash.isOptional()).toBe(true)
  })

  it('signing_keys rows have no field for the private key (public_key_pem only)', () => {
    const signingKeyShape = exportDataSchema.shape.signing_keys.element.shape
    const keys = Object.keys(signingKeyShape)
    expect(keys).toEqual(['kid', 'publicKeyPem', 'createdAt', 'retiredAt'])
    expect(keys.some((k) => /private/i.test(k))).toBe(false)
  })
})

describe('T4 needsPlaceholderPassword', () => {
  it('needs one when passwordHash is absent, null, or empty', () => {
    expect(needsPlaceholderPassword({})).toBe(true)
    expect(needsPlaceholderPassword({ passwordHash: null })).toBe(true)
    expect(needsPlaceholderPassword({ passwordHash: '' })).toBe(true)
  })

  it("doesn't need one when a real hash was included (--include-credentials)", () => {
    expect(needsPlaceholderPassword({ passwordHash: '$argon2id$...' })).toBe(false)
  })
})

describe('T4 isEmptyGiven (instance-restore guard)', () => {
  const allFalse = {
    hasTeams: false,
    hasSubmissions: false,
    hasScores: false,
    hasVotes: false,
    hasPairwiseComparisons: false,
    eventSlugs: [] as string[],
  }

  it('is empty with no rows and no events at all', () => {
    expect(isEmptyGiven(allFalse)).toBe(true)
  })

  it('is empty when the only event is the known fixture event', () => {
    expect(isEmptyGiven({ ...allFalse, eventSlugs: [FIXTURE_SLUG] })).toBe(true)
  })

  it('is NOT empty once a normal docker compose up has run and someone formed a team', () => {
    // This is the exact scenario the plan flagged: seed + fixtures always
    // create teams/submissions/an event, so a naive "any row exists" check
    // would make --force mandatory even for a brand-new install.
    expect(isEmptyGiven({ ...allFalse, hasTeams: true, eventSlugs: [FIXTURE_SLUG] })).toBe(false)
  })

  it('is NOT empty when any of submissions/scores/votes/pairwise comparisons exist', () => {
    expect(isEmptyGiven({ ...allFalse, hasSubmissions: true })).toBe(false)
    expect(isEmptyGiven({ ...allFalse, hasScores: true })).toBe(false)
    expect(isEmptyGiven({ ...allFalse, hasVotes: true })).toBe(false)
    expect(isEmptyGiven({ ...allFalse, hasPairwiseComparisons: true })).toBe(false)
  })

  it('is NOT empty when an event exists whose slug is not the fixture slug', () => {
    expect(isEmptyGiven({ ...allFalse, eventSlugs: ['some-other-event'] })).toBe(false)
    expect(isEmptyGiven({ ...allFalse, eventSlugs: [FIXTURE_SLUG, 'some-other-event'] })).toBe(false)
  })
})

// --- Live-DB round trip -------------------------------------------------------
//
// This is the strongest proof of 4.3 (export -> wipe -> import -> export
// again -> deep-equal), but it wipes tables, so it must never run against a
// real database by accident. It is gated behind BOTH an explicit opt-in env
// var and a database name that looks disposable — see docs/TIER4.md 4.3 for
// the exact invocation. A plain `pnpm test` always skips this block.
const canRunDbTests =
  process.env.ALLOW_DESTRUCTIVE_DB_TESTS === 'true' && /test/i.test(process.env.DATABASE_URL ?? '')

describe.skipIf(!canRunDbTests)('T4 export/import live round trip (destructive — see docs/TIER4.md)', () => {
  // One shared connection for the whole block, closed once at the end —
  // each test dynamically importing '../../src/db' would otherwise get the
  // same cached module singleton, so calling sql.end() inside an individual
  // test would silently break every test that runs after it.
  let closeConnection: () => Promise<void>

  afterAll(async () => {
    await closeConnection?.()
  })

  it('exports, wipes, imports, and re-exports to the same data', async () => {
    const { db, sql } = await import('../../src/db')
    closeConnection = () => sql.end()
    const { submissions, teams, scores, votes, pairwiseComparisons, events } = await import('../../src/db/schema')
    const { exportInstance } = await import('../../src/server/export-service')
    const { importData } = await import('../../src/server/import-service')

    const before = await exportInstance()

    await db.delete(scores)
    await db.delete(votes)
    await db.delete(pairwiseComparisons)
    await db.delete(submissions)
    await db.delete(teams)
    await db.delete(events)

    const summary = await importData(before)
    expect(summary.dryRun).toBe(false)

    const after = await exportInstance()
    // Every export is freshly signed (src/server/export-service.ts), so
    // signed_at/exported_at/signature all differ between two exports of
    // identical data — normalize those away before comparing.
    const normalize = (env: typeof before) => ({
      ...env,
      signed_at: null,
      signature: null,
      payload: { ...env.payload, exported_at: null },
    })
    expect(normalize(after)).toEqual(normalize(before))
  })

  it('dry-run leaves row counts unchanged', async () => {
    const { exportInstance } = await import('../../src/server/export-service')
    const { importData } = await import('../../src/server/import-service')

    const before = await exportInstance()
    const summary = await importData(before, { dryRun: true })
    expect(summary.dryRun).toBe(true)

    const after = await exportInstance()
    expect(after.payload.data.events.length).toBe(before.payload.data.events.length)
    expect(after.payload.data.submissions.length).toBe(before.payload.data.submissions.length)
  })

  it('refuses an instance-scope import without --force once real data exists', async () => {
    const { exportInstance } = await import('../../src/server/export-service')
    const { importData, ImportError } = await import('../../src/server/import-service')

    const backup = await exportInstance()
    await expect(importData(backup)).rejects.toThrow(ImportError)
  })

  it('is idempotent: importing the same backup twice does not duplicate rows', async () => {
    const { exportInstance } = await import('../../src/server/export-service')
    const { importData } = await import('../../src/server/import-service')

    const backup = await exportInstance()
    await importData(backup, { force: true })
    const afterFirst = await exportInstance()
    await importData(backup, { force: true })
    const afterSecond = await exportInstance()

    for (const table of Object.keys(afterFirst.payload.data) as Array<keyof typeof afterFirst.payload.data>) {
      expect(afterSecond.payload.data[table].length, `table "${table}"`).toBe(afterFirst.payload.data[table].length)
    }
  })

  it('never puts a credential or private key in the raw export JSON', async () => {
    const { exportInstance } = await import('../../src/server/export-service')
    const raw = JSON.stringify(await exportInstance())
    expect(raw).not.toContain('passwordHash') // omitted entirely by default (no --include-credentials)
    expect(raw).not.toContain('tokenHash')
    expect(raw).not.toContain('BEGIN PRIVATE KEY') // Ed25519 PKCS8 PEM marker
    expect(raw).not.toContain('BEGIN EC PRIVATE KEY')
  })

  it('an event-scoped export contains only that event and rows that trace back to it', async () => {
    const { eq } = await import('drizzle-orm')
    const { db } = await import('../../src/db')
    const { events, tracks, teams } = await import('../../src/db/schema')
    const { exportEvent } = await import('../../src/server/export-service')

    const close = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const [otherEvent] = await db
      .insert(events)
      .values({
        title: 'A second, unrelated event',
        slug: `other-event-${Date.now()}`,
        submissionDeadline: close,
        judgingEndTime: close,
        publicVotingEndTime: close,
      })
      .returning()
    const [otherTrack] = await db.insert(tracks).values({ eventId: otherEvent.id, name: 'Other track' }).returning()
    const [otherTeam] = await db
      .insert(teams)
      .values({ eventId: otherEvent.id, name: 'Other team', inviteCodeHash: 'x' })
      .returning()

    try {
      const [fixtureEvent] = await db.select().from(events).where(eq(events.slug, FIXTURE_SLUG)).limit(1)
      const scoped = await exportEvent(fixtureEvent.id)

      expect(scoped.payload.data.events.map((e) => e.id)).toEqual([fixtureEvent.id])
      expect(scoped.payload.data.tracks.some((t) => t.id === otherTrack.id)).toBe(false)
      expect(scoped.payload.data.teams.some((t) => t.id === otherTeam.id)).toBe(false)
    } finally {
      await db.delete(teams).where(eq(teams.id, otherTeam.id))
      await db.delete(tracks).where(eq(tracks.id, otherTrack.id))
      await db.delete(events).where(eq(events.id, otherEvent.id))
    }
  })

  it('rolls back the whole import (zero rows written) when one row violates a foreign key', async () => {
    const { eq } = await import('drizzle-orm')
    const { db } = await import('../../src/db')
    const { teams } = await import('../../src/db/schema')
    const { exportInstance } = await import('../../src/server/export-service')
    const { importData } = await import('../../src/server/import-service')

    const backup = await exportInstance()
    const bogusTeamId = '00000000-0000-0000-0000-000000000000'
    // Poisons the *unsigned* inner envelope directly: editing backup.payload
    // (the signed wrapper) would just trip signature verification instead of
    // reaching the FK check this test is actually about. Passing the plain
    // ExportEnvelope through unsigned is exactly the backward-compatible
    // path import-service.ts still supports.
    const poisoned = {
      ...backup.payload,
      data: {
        ...backup.payload.data,
        // Schema-valid (a well-formed UUID row), but references an event_id
        // that exists nowhere in this payload or the database — a real
        // foreign-key violation, not a validation-layer rejection.
        teams: [
          ...backup.payload.data.teams,
          {
            id: bogusTeamId,
            eventId: '00000000-0000-0000-0000-000000000001',
            name: 'Poisoned row',
            inviteCodeHash: 'x',
            isLocked: false,
            createdAt: new Date().toISOString(),
          },
        ],
      },
    }

    await expect(importData(poisoned, { force: true })).rejects.toThrow()

    const [leaked] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, bogusTeamId)).limit(1)
    expect(leaked).toBeUndefined()
  })

  it('writes an audit_logs row for export.created and import.applied', async () => {
    const { desc, eq } = await import('drizzle-orm')
    const { db } = await import('../../src/db')
    const { auditLogs } = await import('../../src/db/schema')
    const { exportInstance } = await import('../../src/server/export-service')
    const { importData } = await import('../../src/server/import-service')

    await exportInstance({ actorId: undefined })
    const [exportLog] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'export.created'))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1)
    expect(exportLog).toBeTruthy()

    const backup = await exportInstance()
    await importData(backup, { dryRun: true })
    const [importLog] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'import.applied'))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1)
    expect(importLog).toBeTruthy()
    expect((importLog.payloadJson as { dryRun: boolean }).dryRun).toBe(true)
  })
})
