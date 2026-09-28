import { beforeEach, describe, expect, it, vi } from 'vitest'

// One shared mock declaration per module for the whole file: vi.mock is
// hoisted per resolved module, so two separate vi.mock() calls for the same
// underlying file (even under different specifiers, e.g. a relative path in
// one describe block and the "@/" alias in another) would silently make the
// second declaration win for the entire file. Each function defaults to the
// real implementation and is overridden per-test with mockResolvedValueOnce/
// mockImplementationOnce, so a test that doesn't care about a given export
// still exercises the real code for it.
const hoisted = vi.hoisted(() => ({
  dbShouldNotBeCalled: vi.fn(() => {
    throw new Error('db was called')
  }),
  getSessionUser: vi.fn(),
  getUserByToken: vi.fn(),
  requireSession: vi.fn(),
  createToken: vi.fn(),
  listTokens: vi.fn(),
  revokeToken: vi.fn(),
  cookieStore: { get: vi.fn((): { value: string } | undefined => undefined) },
  headerStore: { get: vi.fn((): string | null => null) },
}))

vi.mock('../../src/db', () => ({
  db: { select: hoisted.dbShouldNotBeCalled, insert: hoisted.dbShouldNotBeCalled, update: hoisted.dbShouldNotBeCalled },
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => hoisted.cookieStore),
  headers: vi.fn(async () => hoisted.headerStore),
}))
vi.mock('../../src/server/auth-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/server/auth-service')>()
  return { ...actual, getSessionUser: hoisted.getSessionUser }
})
vi.mock('../../src/server/token-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/server/token-service')>()
  hoisted.getUserByToken.mockImplementation(actual.getUserByToken)
  hoisted.createToken.mockImplementation(actual.createToken)
  hoisted.listTokens.mockImplementation(actual.listTokens)
  hoisted.revokeToken.mockImplementation(actual.revokeToken)
  return {
    ...actual,
    getUserByToken: hoisted.getUserByToken,
    createToken: hoisted.createToken,
    listTokens: hoisted.listTokens,
    revokeToken: hoisted.revokeToken,
  }
})
vi.mock('@/src/server/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/server/http')>()
  return { ...actual, requireSession: hoisted.requireSession }
})

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.cookieStore.get.mockReturnValue(undefined)
  hoisted.headerStore.get.mockReturnValue(null)
})

describe('T4 getUserByToken: malformed input never touches the database', () => {
  it('returns null for a missing header without querying the database', async () => {
    const { getUserByToken } = await import('../../src/server/token-service')
    expect(await getUserByToken(null)).toBeNull()
    expect(hoisted.dbShouldNotBeCalled).not.toHaveBeenCalled()
  })

  it('returns null for a non-Bearer header without querying the database', async () => {
    const { getUserByToken } = await import('../../src/server/token-service')
    expect(await getUserByToken('Basic dXNlcjpwYXNz')).toBeNull()
    expect(hoisted.dbShouldNotBeCalled).not.toHaveBeenCalled()
  })

  it('returns null for a Bearer token with the wrong prefix without querying the database', async () => {
    const { getUserByToken } = await import('../../src/server/token-service')
    expect(await getUserByToken('Bearer sk_not_our_prefix')).toBeNull()
    expect(hoisted.dbShouldNotBeCalled).not.toHaveBeenCalled()
  })
})

describe('T4 requireSession: cookie then Bearer, never leaking which failed', () => {
  // requireSession is the function under test here, so these bypass this
  // file's own '@/src/server/http' mock (needed by the token-routes block
  // below) via importActual, while still exercising it against the file's
  // mocked getSessionUser/getUserByToken/cookies/headers.
  async function realRequireSession() {
    const actual = await vi.importActual<typeof import('../../src/server/http')>('../../src/server/http')
    return actual.requireSession()
  }

  it('resolves via the cookie session when present, never checking the bearer header', async () => {
    hoisted.getSessionUser.mockResolvedValue({ user: { id: 'u1' }, expiresAt: new Date('2030-01-01') })
    const session = await realRequireSession()
    expect(session.user).toEqual({ id: 'u1' })
    expect(hoisted.getUserByToken).not.toHaveBeenCalled()
  })

  it('falls back to a Bearer token when there is no cookie session', async () => {
    hoisted.getSessionUser.mockResolvedValue(null)
    hoisted.headerStore.get.mockReturnValue('Bearer dfk_abc')
    hoisted.getUserByToken.mockResolvedValue({ id: 'u2', role: 'ORGANIZER' })
    const session = await realRequireSession()
    expect(session.user).toEqual({ id: 'u2', role: 'ORGANIZER' })
  })

  it('401s when neither the cookie nor the bearer token resolves', async () => {
    hoisted.getSessionUser.mockResolvedValue(null)
    hoisted.getUserByToken.mockResolvedValue(null)
    await expect(realRequireSession()).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 })
  })
})

describe('T4 token routes: raw token and hash never leak', () => {
  beforeEach(() => {
    hoisted.requireSession.mockResolvedValue({ user: { id: 'user-a' }, expiresAt: new Date() })
  })

  it('POST /api/tokens returns the raw token once, with no hash field', async () => {
    hoisted.createToken.mockResolvedValue({
      id: 'tok-1',
      token: 'dfk_rawvalue',
      name: 'ci-script',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    const { POST } = await import('../../app/api/tokens/route')
    const res = await POST(
      new Request('http://localhost/api/tokens', {
        method: 'POST',
        body: JSON.stringify({ name: 'ci-script' }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body).toEqual({ id: 'tok-1', name: 'ci-script', token: 'dfk_rawvalue', createdAt: '2026-01-01T00:00:00.000Z' })
    expect(hoisted.createToken).toHaveBeenCalledWith('user-a', 'ci-script')
  })

  it('GET /api/tokens never returns tokenHash, even though the service row carries one', async () => {
    hoisted.listTokens.mockResolvedValue([
      {
        id: 'tok-1',
        name: 'ci-script',
        tokenHash: 'super-secret-sha256-hash-should-never-leave-the-server',
        tokenPrefix: 'dfk_Ab12Cd34',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        lastUsedAt: null,
        revokedAt: null,
      },
    ])
    const { GET } = await import('../../app/api/tokens/route')
    const res = await GET(new Request('http://localhost/api/tokens'))
    const bodyText = await res.text()
    expect(bodyText).not.toContain('tokenHash')
    expect(bodyText).not.toContain('super-secret-sha256-hash')
    const body = JSON.parse(bodyText)
    expect(body.tokens).toEqual([
      {
        id: 'tok-1',
        name: 'ci-script',
        tokenPrefix: 'dfk_Ab12Cd34',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastUsedAt: null,
        revokedAt: null,
      },
    ])
  })

  it("DELETE only ever scopes to the CALLER's own id — never a client-supplied owner", async () => {
    hoisted.revokeToken.mockResolvedValue(true)
    const { DELETE } = await import('../../app/api/tokens/[id]/route')
    const res = await DELETE(new Request('http://localhost/api/tokens/tok-1', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'tok-1' }),
    })
    expect(res.status).toBe(200)
    // Note the call shape: (session.user.id, tokenId) — the route has no way
    // to pass any other user's id, so "user A can't revoke user B's token"
    // reduces to token-service.ts's WHERE (id AND userId) actually excluding
    // rows owned by someone else, which is the live-DB test below.
    expect(hoisted.revokeToken).toHaveBeenCalledWith('user-a', 'tok-1')
  })

  it("404s (not 403) when revokeToken reports the token isn't the caller's — no ownership oracle", async () => {
    hoisted.revokeToken.mockResolvedValue(false)
    const { DELETE } = await import('../../app/api/tokens/[id]/route')
    const res = await DELETE(new Request('http://localhost/api/tokens/tok-owned-by-someone-else', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'tok-owned-by-someone-else' }),
    })
    expect(res.status).toBe(404)
  })
})

// --- Live-DB proof of the ownership scoping itself -----------------------
//
// The tests above prove the route always calls revokeToken with the
// caller's own id and never leaks tokenHash; they can't prove the SQL WHERE
// clause in token-service.ts actually excludes another user's row — that's
// a real Postgres guarantee, gated the same way as the export/import round
// trip (never runs against a real dev database by accident). This block
// bypasses the file's own db/token-service mocks via vi.importActual so it
// exercises the true implementation against a real (disposable) database.
const canRunDbTests =
  process.env.ALLOW_DESTRUCTIVE_DB_TESTS === 'true' && /test/i.test(process.env.DATABASE_URL ?? '')

describe.skipIf(!canRunDbTests)('T4 token ownership (live DB)', () => {
  it("user A cannot revoke user B's token, and a revoked token stops authenticating", async () => {
    const { eq, inArray } = await import('drizzle-orm')
    const { db, sql } = await vi.importActual<typeof import('../../src/db')>('../../src/db')
    const { users, apiTokens } = await import('../../src/db/schema')
    const { createToken, revokeToken, getUserByToken } =
      await vi.importActual<typeof import('../../src/server/token-service')>('../../src/server/token-service')
    const { hashPassword } = await import('../../src/server/auth-service')

    const passwordHash = await hashPassword('irrelevant-not-logged-in-with')
    const [userA] = await db.insert(users).values({ email: `a-${Date.now()}@local`, passwordHash, role: 'PARTICIPANT' }).returning()
    const [userB] = await db.insert(users).values({ email: `b-${Date.now()}@local`, passwordHash, role: 'PARTICIPANT' }).returning()

    try {
      const issued = await createToken(userA.id, 'test token')

      expect(await revokeToken(userB.id, issued.id)).toBe(false)
      expect(await getUserByToken(`Bearer ${issued.token}`)).toMatchObject({ id: userA.id })

      expect(await revokeToken(userA.id, issued.id)).toBe(true)
      expect(await getUserByToken(`Bearer ${issued.token}`)).toBeNull()

      await db.delete(apiTokens).where(eq(apiTokens.id, issued.id))
    } finally {
      await db.delete(users).where(inArray(users.id, [userA.id, userB.id]))
      await sql.end()
    }
  })
})
