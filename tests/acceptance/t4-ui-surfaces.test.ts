import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// SettingsPanel calls useRouter() (next/navigation), which needs a real App
// Router context renderToStaticMarkup alone doesn't provide — stub only that
// export, keeping the real redirect() (the /settings redirect test below
// needs it to actually throw Next's redirect signal).
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>()
  return { ...actual, useRouter: () => ({ push: () => {}, refresh: () => {} }) }
})

describe('T4 SettingsPanel: Import section visibility', () => {
  const baseProps = {
    event: {
      id: 'evt-1',
      title: 'Test Event',
      slug: 'test-event',
      status: 'DRAFT',
      registrationEnd: null,
      submissionStart: null,
      submissionDeadline: null,
      judgingStart: null,
      judgingEndTime: null,
      publicVotingStart: null,
      publicVotingEndTime: null,
      announcementDate: null,
      logoUrl: null,
      bannerUrl: null,
      cardBannerUrl: null,
      websiteUrl: null,
      descriptionHtml: null,
      format: 'ONLINE' as const,
      locationName: null,
      locationAddress: null,
      mapsUrl: null,
      participationType: 'TEAM' as const,
      minTeamSize: 1,
      maxTeamSize: 4,
      audience: 'OPEN' as const,
      participationCertificate: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    members: [],
    selfId: 'user-1',
    webhooks: [],
  }

  it('never renders "Import data" for a non-superadmin organizer', async () => {
    const { SettingsPanel } = await import('../../components/console/dashboard/settings-panel')
    const html = renderToStaticMarkup(createElement(SettingsPanel, { ...baseProps, isSuperadmin: false }))
    expect(html).not.toContain('Import data')
  })

  it('renders "Import data" for a superadmin', async () => {
    const { SettingsPanel } = await import('../../components/console/dashboard/settings-panel')
    const html = renderToStaticMarkup(createElement(SettingsPanel, { ...baseProps, isSuperadmin: true }))
    expect(html).toContain('Import data')
  })
})

describe('T4 /settings redirects to /login with no session', () => {
  const settingsHoisted = vi.hoisted(() => ({ getSessionUser: vi.fn() }))
  vi.mock('../../src/server/auth-service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/server/auth-service')>()
    return { ...actual, getSessionUser: settingsHoisted.getSessionUser }
  })
  vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({ get: () => undefined })),
  }))
  vi.mock('../../src/server/token-service', () => ({ listTokens: vi.fn(async () => []) }))

  beforeEach(() => vi.clearAllMocks())

  it('throws Next\'s redirect signal targeting /login when there is no session', async () => {
    settingsHoisted.getSessionUser.mockResolvedValue(null)
    const SettingsPage = (await import('../../app/settings/page')).default
    await expect(SettingsPage()).rejects.toMatchObject({ digest: expect.stringContaining('/login') })
  })
})

describe('T4 GET /api/events/{id}/export.json sends content-disposition', () => {
  const exportRouteHoisted = vi.hoisted(() => ({
    requireSession: vi.fn(),
    getEffectiveRole: vi.fn(),
    eventExists: vi.fn(),
    exportEvent: vi.fn(),
  }))
  vi.mock('@/src/server/http', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/server/http')>()
    return { ...actual, requireSession: exportRouteHoisted.requireSession }
  })
  vi.mock('@/src/server/auth-service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/server/auth-service')>()
    return { ...actual, getEffectiveRole: exportRouteHoisted.getEffectiveRole }
  })
  vi.mock('@/src/server/export-service', () => ({
    eventExists: exportRouteHoisted.eventExists,
    exportEvent: exportRouteHoisted.exportEvent,
  }))

  beforeEach(() => vi.clearAllMocks())

  it('includes an attachment content-disposition header naming the event', async () => {
    exportRouteHoisted.requireSession.mockResolvedValue({ user: { id: 'user-1', role: 'ORGANIZER' }, expiresAt: new Date() })
    exportRouteHoisted.eventExists.mockResolvedValue(true)
    exportRouteHoisted.getEffectiveRole.mockResolvedValue('ORGANIZER')
    exportRouteHoisted.exportEvent.mockResolvedValue({ format: 'dogfood-signed', payload: { format: 'dogfood-export' } })

    const { GET } = await import('../../app/api/events/[id]/export.json/route')
    const res = await GET(new Request('http://localhost/api/events/evt-1/export.json'), {
      params: Promise.resolve({ id: 'evt-1' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="event-evt-1-export.json"')
  })
})
