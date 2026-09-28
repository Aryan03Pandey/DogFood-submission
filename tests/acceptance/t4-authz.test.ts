import { beforeEach, describe, expect, it, vi } from 'vitest'

// Route-level authz matrix for the T4 export/import boundaries — the same
// principle the spec itself calls out as the most important T2 check
// (backend-enforced isolation, never decorative): every one of these must be
// enforced in the route/service, so mocking only requireSession/
// getEffectiveRole/the service call (never the route handler itself) proves
// the route's own authorization logic, not just that a mock resolved.
const hoisted = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getEffectiveRole: vi.fn(),
  eventExists: vi.fn(),
  exportEvent: vi.fn(),
  importData: vi.fn(),
}))

vi.mock('@/src/server/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/server/http')>()
  return { ...actual, requireSession: hoisted.requireSession }
})
vi.mock('@/src/server/auth-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/server/auth-service')>()
  return { ...actual, getEffectiveRole: hoisted.getEffectiveRole }
})
vi.mock('@/src/server/export-service', () => ({
  eventExists: hoisted.eventExists,
  exportEvent: hoisted.exportEvent,
}))
vi.mock('@/src/server/import-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/server/import-service')>()
  return { ...actual, importData: hoisted.importData }
})

import { AuthError } from '../../src/server/auth-service'

function fakeUser(overrides: Partial<{ id: string; role: string }> = {}) {
  return { id: overrides.id ?? 'user-1', role: overrides.role ?? 'PARTICIPANT' } as any
}

describe('T4 authz matrix: GET /api/events/{id}/export.json', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hoisted.eventExists.mockResolvedValue(true)
  })

  async function callExport(eventId = 'evt-1') {
    const { GET } = await import('../../app/api/events/[id]/export.json/route')
    return GET(new Request(`http://localhost/api/events/${eventId}/export.json`), {
      params: Promise.resolve({ id: eventId }),
    })
  }

  it('401s an anonymous caller', async () => {
    hoisted.requireSession.mockRejectedValue(new AuthError('UNAUTHORIZED', 401))
    const res = await callExport()
    expect(res.status).toBe(401)
  })

  it("403s a participant (not this event's organizer)", async () => {
    hoisted.requireSession.mockResolvedValue({ user: fakeUser(), expiresAt: new Date() })
    hoisted.getEffectiveRole.mockResolvedValue('PARTICIPANT')
    const res = await callExport()
    expect(res.status).toBe(403)
    expect(hoisted.exportEvent).not.toHaveBeenCalled()
  })

  it("403s an organizer of a DIFFERENT event", async () => {
    // Same mechanism as above — getEffectiveRole is itself scoped to the
    // requested event id, so an organizer elsewhere resolves to PARTICIPANT
    // for this one.
    hoisted.requireSession.mockResolvedValue({ user: fakeUser({ role: 'PARTICIPANT' }), expiresAt: new Date() })
    hoisted.getEffectiveRole.mockResolvedValue('PARTICIPANT')
    const res = await callExport('evt-not-mine')
    expect(res.status).toBe(403)
  })

  it("200s this event's organizer", async () => {
    hoisted.requireSession.mockResolvedValue({ user: fakeUser(), expiresAt: new Date() })
    hoisted.getEffectiveRole.mockResolvedValue('ORGANIZER')
    hoisted.exportEvent.mockResolvedValue({ format: 'dogfood-export', version: 1, scope: 'event', data: {} })
    const res = await callExport()
    expect(res.status).toBe(200)
    expect(hoisted.exportEvent).toHaveBeenCalledWith('evt-1', { actorId: 'user-1' })
  })

  it('200s a superadmin regardless of event ownership', async () => {
    hoisted.requireSession.mockResolvedValue({ user: fakeUser({ role: 'SUPERADMIN' }), expiresAt: new Date() })
    hoisted.getEffectiveRole.mockResolvedValue('SUPERADMIN')
    hoisted.exportEvent.mockResolvedValue({ format: 'dogfood-export', version: 1, scope: 'event', data: {} })
    const res = await callExport()
    expect(res.status).toBe(200)
  })

  it('404s an unknown event before ever checking role', async () => {
    hoisted.requireSession.mockResolvedValue({ user: fakeUser(), expiresAt: new Date() })
    hoisted.eventExists.mockResolvedValue(false)
    const res = await callExport()
    expect(res.status).toBe(404)
    expect(hoisted.getEffectiveRole).not.toHaveBeenCalled()
  })
})

describe('T4 authz matrix: POST /api/admin/import', () => {
  beforeEach(() => vi.clearAllMocks())

  async function callImport(body: unknown = {}) {
    const { POST } = await import('../../app/api/admin/import/route')
    return POST(
      new Request('http://localhost/api/admin/import', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      }),
    )
  }

  it('401s an anonymous caller', async () => {
    hoisted.requireSession.mockRejectedValue(new AuthError('UNAUTHORIZED', 401))
    const res = await callImport()
    expect(res.status).toBe(401)
  })

  it('403s a non-superadmin (organizer, participant, judge — any non-global-admin role)', async () => {
    hoisted.requireSession.mockResolvedValue({ user: fakeUser({ role: 'ORGANIZER' }), expiresAt: new Date() })
    const res = await callImport()
    expect(res.status).toBe(403)
    expect(hoisted.importData).not.toHaveBeenCalled()
  })

  it('200s a superadmin, forwarding actorId', async () => {
    hoisted.requireSession.mockResolvedValue({ user: fakeUser({ id: 'admin-1', role: 'SUPERADMIN' }), expiresAt: new Date() })
    hoisted.importData.mockResolvedValue({ dryRun: false, counts: {}, placeholderPasswordUserIds: [] })
    const res = await callImport({ some: 'payload' })
    expect(res.status).toBe(200)
    expect(hoisted.importData).toHaveBeenCalledWith(
      { some: 'payload' },
      expect.objectContaining({ actorId: 'admin-1' }),
    )
  })

  it('413s an oversized body without ever reaching importData', async () => {
    hoisted.requireSession.mockResolvedValue({ user: fakeUser({ role: 'SUPERADMIN' }), expiresAt: new Date() })
    const { POST } = await import('../../app/api/admin/import/route')
    const oversized = new Request('http://localhost/api/admin/import', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json', 'content-length': String(26 * 1024 * 1024) },
    })
    const res = await POST(oversized)
    expect(res.status).toBe(413)
    expect(hoisted.importData).not.toHaveBeenCalled()
  })
})
