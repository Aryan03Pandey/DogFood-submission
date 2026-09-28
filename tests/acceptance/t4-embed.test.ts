import { describe, expect, it, vi } from 'vitest'

// DB-free: getEventGalleryProjects is mocked directly rather than hitting
// Postgres, since this file is about the embed route's own behavior (404 on
// a missing event, an empty-but-200 feed otherwise) — the visibility rules
// themselves are gallery-service.ts's job and already covered elsewhere.
const hoisted = vi.hoisted(() => ({ getEventGalleryProjects: vi.fn() }))
vi.mock('../../src/server/gallery-service', () => ({ getEventGalleryProjects: hoisted.getEventGalleryProjects }))

describe('T4 embeddable gallery route', () => {
  it('404s only when the event does not exist', async () => {
    hoisted.getEventGalleryProjects.mockResolvedValueOnce(null)
    const { notFound } = await import('next/navigation')
    const Page = (await import('../../app/embed/[eventId]/page')).default
    await expect(
      Page({ params: Promise.resolve({ eventId: 'missing' }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow() // next/navigation's notFound() throws a special NEXT_HTTP_ERROR_FALLBACK sentinel
    expect(notFound).toBeDefined()
  })

  it('renders an empty (not 404) feed for an existing event with nothing public yet', async () => {
    hoisted.getEventGalleryProjects.mockResolvedValueOnce([])
    const Page = (await import('../../app/embed/[eventId]/page')).default
    const element = await Page({
      params: Promise.resolve({ eventId: 'evt_01' }),
      searchParams: Promise.resolve({}),
    })
    expect(element).toBeTruthy()
  })

  it('never receives draft/hidden projects — that filtering is gallery-service.ts, not the route', async () => {
    // getEventGalleryProjects itself already excludes drafts/hidden (see
    // isGalleryVisible in src/lib/gallery.ts); this asserts the route
    // renders exactly what it's given, adding no visibility logic of its own.
    hoisted.getEventGalleryProjects.mockResolvedValueOnce([
      {
        id: 'sub_1',
        title: 'Visible Project',
        tagline: null,
        repoUrl: null,
        submittedAt: null,
        submittedLabel: null,
        teamName: 'Team A',
        trackName: 'Track A',
        trackId: 'trk_1',
        eventTitle: 'Event',
        eventStatus: 'ARCHIVED',
      },
    ])
    const Page = (await import('../../app/embed/[eventId]/page')).default
    const element = await Page({
      params: Promise.resolve({ eventId: 'evt_01' }),
      searchParams: Promise.resolve({}),
    })
    expect(JSON.stringify(element)).toContain('Visible Project')
  })

  it('passes the track query param straight through to getEventGalleryProjects', async () => {
    hoisted.getEventGalleryProjects.mockResolvedValueOnce([])
    const Page = (await import('../../app/embed/[eventId]/page')).default
    await Page({
      params: Promise.resolve({ eventId: 'evt_01' }),
      searchParams: Promise.resolve({ track: 'trk_42' }),
    })
    expect(hoisted.getEventGalleryProjects).toHaveBeenCalledWith('evt_01', { track: 'trk_42', limit: undefined })
  })

  it.each([
    ['a non-numeric limit', 'abc'],
    ['a negative limit', '-5'],
    ['zero', '0'],
    ['a decimal', '2.5'],
  ])('treats %s as "no limit" instead of passing it through', async (_label, rawLimit) => {
    hoisted.getEventGalleryProjects.mockResolvedValueOnce([])
    const Page = (await import('../../app/embed/[eventId]/page')).default
    await Page({
      params: Promise.resolve({ eventId: 'evt_01' }),
      searchParams: Promise.resolve({ limit: rawLimit }),
    })
    // In particular: Array.prototype.slice(0, -5) would silently drop the
    // last 5 items rather than mean "no limit" — this is the bug a raw
    // Number.isFinite(-5) === true check would let through.
    expect(hoisted.getEventGalleryProjects).toHaveBeenCalledWith('evt_01', { track: undefined, limit: undefined })
  })

  it('accepts a huge (but valid) limit without crashing', async () => {
    hoisted.getEventGalleryProjects.mockResolvedValueOnce([])
    const Page = (await import('../../app/embed/[eventId]/page')).default
    await Page({
      params: Promise.resolve({ eventId: 'evt_01' }),
      searchParams: Promise.resolve({ limit: '999999999' }),
    })
    expect(hoisted.getEventGalleryProjects).toHaveBeenCalledWith('evt_01', { track: undefined, limit: 999999999 })
  })

  it('treats an unknown theme value as light (no "dark" class), not an error', async () => {
    hoisted.getEventGalleryProjects.mockResolvedValueOnce([])
    const Page = (await import('../../app/embed/[eventId]/page')).default
    const element = await Page({
      params: Promise.resolve({ eventId: 'evt_01' }),
      searchParams: Promise.resolve({ theme: 'not-a-real-theme' }),
    })
    expect((element as any).props.className).toBeUndefined()
  })

  it('never uses dangerouslySetInnerHTML, so a hostile project title can never be interpreted as HTML', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../../app/embed/[eventId]/page.tsx', import.meta.url), 'utf8')
    expect(source).not.toContain('dangerouslySetInnerHTML')

    hoisted.getEventGalleryProjects.mockResolvedValueOnce([
      {
        id: 'sub_xss',
        title: '<script>alert(1)</script>',
        tagline: null,
        repoUrl: null,
        submittedAt: null,
        submittedLabel: null,
        teamName: 'Team A',
        trackName: 'Track A',
        trackId: 'trk_1',
        eventTitle: 'Event',
        eventStatus: 'ARCHIVED',
      },
    ])
    const Page = (await import('../../app/embed/[eventId]/page')).default
    const element = await Page({
      params: Promise.resolve({ eventId: 'evt_01' }),
      searchParams: Promise.resolve({}),
    })
    // The title survives as plain string data in the element tree (it's
    // rendered, not dropped) — combined with the dangerouslySetInnerHTML
    // grep above, that's the whole safety argument: React only ever escapes
    // JSX text children, so a plain string here can't become live markup.
    expect(JSON.stringify(element)).toContain('<script>alert(1)</script>')
  })
})

describe('T4 embed CSP headers (next.config.mjs)', () => {
  it('lists the global frame-ancestors rule before the /embed override, so the embed override wins', async () => {
    const config = (await import('../../next.config.mjs')).default
    expect(config.headers).toBeDefined()
    const rules = await config.headers!()
    const globalIndex = rules.findIndex((r: { source: string }) => r.source === '/:path*')
    const embedIndex = rules.findIndex((r: { source: string }) => r.source === '/embed/:path*')
    expect(globalIndex).toBeGreaterThanOrEqual(0)
    expect(embedIndex).toBeGreaterThan(globalIndex)

    const globalCsp = rules[globalIndex].headers.find((h: { key: string }) => h.key === 'Content-Security-Policy')
    const embedCsp = rules[embedIndex].headers.find((h: { key: string }) => h.key === 'Content-Security-Policy')
    expect(globalCsp?.value).toBe("frame-ancestors 'self'")
    expect(embedCsp?.value).toBe('frame-ancestors *')
  })
})
