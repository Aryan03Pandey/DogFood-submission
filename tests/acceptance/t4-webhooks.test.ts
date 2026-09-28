import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Tier 4.5: SSRF hardening, HMAC signing, backoff calculation, and the
// worker's per-delivery-attempt logic. DNS is mocked (node:dns) so these
// stay fully offline/deterministic — no real lookups, matching this repo's
// "no outbound network at runtime" ethos even in tests.
const hoisted = vi.hoisted(() => {
  const addresses = new Map<string, Array<{ address: string; family: number }>>([
    ['good.example.com', [{ address: '93.184.216.34', family: 4 }]],
    ['internal.example.com', [{ address: '10.0.0.5', family: 4 }]],
    ['loopback.example.com', [{ address: '127.0.0.1', family: 4 }]],
    ['linklocal.example.com', [{ address: '169.254.1.1', family: 4 }]],
    ['ipv6-loopback.example.com', [{ address: '::1', family: 6 }]],
    ['ipv6-ula.example.com', [{ address: 'fd12:3456:789a::1', family: 6 }]],
  ])
  const state = { selectQueue: [] as unknown[][], selectIndex: 0, insertCalls: [] as unknown[], getEffectiveRole: null as any }

  function nextSelect() {
    const rows = state.selectQueue[state.selectIndex] ?? []
    state.selectIndex++
    const p: any = Promise.resolve(rows)
    for (const method of ['from', 'where', 'limit']) p[method] = () => p
    return p
  }

  return { addresses, state, nextSelect }
})

vi.mock('node:dns', () => ({
  promises: {
    lookup: vi.fn(async (hostname: string) => {
      const found = hoisted.addresses.get(hostname)
      if (!found) throw new Error('ENOTFOUND')
      return found
    }),
  },
}))

vi.mock('../../src/db', () => ({
  db: {
    select: () => hoisted.nextSelect(),
    insert: () => ({
      values: (values: unknown) => {
        hoisted.state.insertCalls.push(values)
        return Promise.resolve(undefined)
      },
    }),
  },
}))
vi.mock('../../src/server/auth-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/server/auth-service')>()
  return { ...actual, getEffectiveRole: (...args: unknown[]) => hoisted.state.getEffectiveRole(...args) }
})
vi.mock('../../src/server/audit-service', () => ({ recordAuditLog: vi.fn(async () => undefined) }))

import { assertSafeWebhookUrl } from '../../src/server/webhook-url-guard'
import { computeWebhookSignature } from '../../src/server/webhook-signing'
import { attemptDelivery, nextAttemptDelayMs } from '../../src/server/webhook-delivery-service'
import { sendTestWebhook } from '../../src/server/webhook-service'

function fakeUser(overrides: Partial<{ id: string; role: string }> = {}) {
  return { id: overrides.id ?? 'organizer-1', role: overrides.role ?? 'PARTICIPANT' } as any
}

describe('T4 assertSafeWebhookUrl: SSRF hardening', () => {
  const originalAllowPrivate = process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS
  const originalAllowedHosts = process.env.WEBHOOK_ALLOWED_HOSTS
  afterEach(() => {
    process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS = originalAllowPrivate
    process.env.WEBHOOK_ALLOWED_HOSTS = originalAllowedHosts
  })

  it('rejects a non-http(s) scheme', async () => {
    await expect(assertSafeWebhookUrl('ftp://good.example.com/hook')).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_URL',
    })
  })

  it('rejects compose service hostnames even though they resolve fine inside the network', async () => {
    await expect(assertSafeWebhookUrl('http://postgres:5432/hook')).rejects.toMatchObject({
      code: 'UNSAFE_WEBHOOK_URL',
    })
    await expect(assertSafeWebhookUrl('http://seaweedfs/hook')).rejects.toMatchObject({
      code: 'UNSAFE_WEBHOOK_URL',
    })
  })

  it('rejects a hostname resolving to a private, loopback, or link-local IPv4 address', async () => {
    await expect(assertSafeWebhookUrl('http://internal.example.com/hook')).rejects.toMatchObject({
      code: 'UNSAFE_WEBHOOK_URL',
    })
    await expect(assertSafeWebhookUrl('http://loopback.example.com/hook')).rejects.toMatchObject({
      code: 'UNSAFE_WEBHOOK_URL',
    })
    await expect(assertSafeWebhookUrl('http://linklocal.example.com/hook')).rejects.toMatchObject({
      code: 'UNSAFE_WEBHOOK_URL',
    })
  })

  it('rejects a hostname resolving to an IPv6 loopback or unique-local address', async () => {
    await expect(assertSafeWebhookUrl('http://ipv6-loopback.example.com/hook')).rejects.toMatchObject({
      code: 'UNSAFE_WEBHOOK_URL',
    })
    await expect(assertSafeWebhookUrl('http://ipv6-ula.example.com/hook')).rejects.toMatchObject({
      code: 'UNSAFE_WEBHOOK_URL',
    })
  })

  it('allows a public-looking host', async () => {
    await expect(assertSafeWebhookUrl('https://good.example.com/hook')).resolves.toBeUndefined()
  })

  it('WEBHOOK_ALLOW_PRIVATE_HOSTS=true bypasses every check, including normally-blocked hosts', async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS = 'true'
    await expect(assertSafeWebhookUrl('http://postgres:5432/hook')).resolves.toBeUndefined()
    await expect(assertSafeWebhookUrl('http://loopback.example.com/hook')).resolves.toBeUndefined()
  })

  it('WEBHOOK_ALLOWED_HOSTS bypasses checks only for the listed hostname, not others', async () => {
    process.env.WEBHOOK_ALLOWED_HOSTS = 'loopback.example.com, postgres'
    await expect(assertSafeWebhookUrl('http://loopback.example.com/hook')).resolves.toBeUndefined()
    await expect(assertSafeWebhookUrl('http://postgres:5432/hook')).resolves.toBeUndefined()
    // Not on the list — still fully checked and rejected.
    await expect(assertSafeWebhookUrl('http://internal.example.com/hook')).rejects.toMatchObject({
      code: 'UNSAFE_WEBHOOK_URL',
    })
    await expect(assertSafeWebhookUrl('http://seaweedfs/hook')).rejects.toMatchObject({
      code: 'UNSAFE_WEBHOOK_URL',
    })
  })

  it('WEBHOOK_ALLOWED_HOSTS is case-insensitive and tolerates whitespace around entries', async () => {
    process.env.WEBHOOK_ALLOWED_HOSTS = '  LoopBack.Example.Com  ,,  '
    await expect(assertSafeWebhookUrl('http://loopback.example.com/hook')).resolves.toBeUndefined()
  })

  it('an empty/unset WEBHOOK_ALLOWED_HOSTS allowlists nothing', async () => {
    process.env.WEBHOOK_ALLOWED_HOSTS = ''
    await expect(assertSafeWebhookUrl('http://loopback.example.com/hook')).rejects.toMatchObject({
      code: 'UNSAFE_WEBHOOK_URL',
    })
  })
})

describe('T4 webhook HMAC signing', () => {
  it('matches a known test vector', () => {
    const signature = computeWebhookSignature('test-secret', 1700000000, { a: 1, b: 'two' })
    expect(signature).toBe('b9ed539ee1ba27cfd5fb9e486d5dec31649cf7ae2c3934b9561834e16d5ccca7')
  })

  it('changes if the timestamp, secret, or body changes', () => {
    const base = computeWebhookSignature('test-secret', 1700000000, { a: 1 })
    expect(computeWebhookSignature('different-secret', 1700000000, { a: 1 })).not.toBe(base)
    expect(computeWebhookSignature('test-secret', 1700000001, { a: 1 })).not.toBe(base)
    expect(computeWebhookSignature('test-secret', 1700000000, { a: 2 })).not.toBe(base)
  })
})

describe('T4 webhook backoff', () => {
  it('doubles per attempt and caps at the maximum', () => {
    expect(nextAttemptDelayMs(1)).toBe(60_000)
    expect(nextAttemptDelayMs(2)).toBe(120_000)
    expect(nextAttemptDelayMs(3)).toBe(240_000)
    expect(nextAttemptDelayMs(10)).toBe(60 * 60 * 1000) // capped
  })
})

describe('T4 attemptDelivery: worker per-row logic, mocked fetch', () => {
  const originalFetch = global.fetch
  beforeEach(() => {
    process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS = 'true' // skip DNS entirely for these
  })
  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS
  })

  it('reports ok on a 2xx response and sends the expected headers', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>
      expect(headers['x-dogfood-event']).toBe('submission.created')
      expect(headers['x-dogfood-delivery']).toBe('delivery-1')
      expect(headers['x-dogfood-signature']).toMatch(/^sha256=[0-9a-f]{64}$/)
      expect(headers['x-dogfood-timestamp']).toMatch(/^\d+$/)
      return new Response(null, { status: 200 })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await attemptDelivery({
      url: 'http://example.com/hook',
      secret: 'test-secret',
      eventType: 'submission.created',
      deliveryId: 'delivery-1',
      payload: { submissionId: 'sub-1' },
    })
    expect(result).toEqual({ ok: true, status: 200 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports not-ok on a non-2xx response, without throwing', async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch
    const result = await attemptDelivery({
      url: 'http://example.com/hook',
      secret: 'test-secret',
      eventType: 'submission.created',
      deliveryId: 'delivery-1',
      payload: {},
    })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(500)
  })

  it('reports not-ok when fetch itself throws (network error)', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('connection refused')
    }) as unknown as typeof fetch
    const result = await attemptDelivery({
      url: 'http://example.com/hook',
      secret: 'test-secret',
      eventType: 'submission.created',
      deliveryId: 'delivery-1',
      payload: {},
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/connection refused/)
  })

  it('never calls fetch for an unsafe URL', async () => {
    delete process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch
    const result = await attemptDelivery({
      url: 'http://loopback.example.com/hook',
      secret: 'test-secret',
      eventType: 'submission.created',
      deliveryId: 'delivery-1',
      payload: {},
    })
    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('T4 sendTestWebhook: one-off ping to a single endpoint', () => {
  beforeEach(() => {
    hoisted.state.selectQueue = []
    hoisted.state.selectIndex = 0
    hoisted.state.insertCalls = []
    hoisted.state.getEffectiveRole = vi.fn(async () => 'ORGANIZER')
  })

  it('enqueues exactly one webhook.test delivery to the named endpoint', async () => {
    hoisted.state.selectQueue = [[{ id: 'endpoint-1' }]]
    const sent = await sendTestWebhook(fakeUser(), 'evt-1', 'endpoint-1')
    expect(sent).toBe(true)
    expect(hoisted.state.insertCalls).toHaveLength(1)
    expect(hoisted.state.insertCalls[0]).toMatchObject({
      endpointId: 'endpoint-1',
      eventId: 'evt-1',
      eventType: 'webhook.test',
    })
  })

  it('returns false and inserts nothing for an endpoint id that is not on this event', async () => {
    hoisted.state.selectQueue = [[]] // (id AND eventId) matched zero rows
    const sent = await sendTestWebhook(fakeUser(), 'evt-1', 'someone-elses-endpoint')
    expect(sent).toBe(false)
    expect(hoisted.state.insertCalls).toHaveLength(0)
  })

  it('403s a non-organizer before ever touching the database', async () => {
    hoisted.state.getEffectiveRole.mockResolvedValue('PARTICIPANT')
    await expect(sendTestWebhook(fakeUser(), 'evt-1', 'endpoint-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    })
    expect(hoisted.state.insertCalls).toHaveLength(0)
  })
})
