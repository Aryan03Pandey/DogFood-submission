import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { seededOrder } from '../../src/db/schema'
import {
  jaccardSimilarity,
  stringNormalizedSimilarity,
  calculateProjectSimilarity,
} from '../../src/lib/similarity'
import {
  checkRateLimit,
  generateVoterFingerprint,
  validateHoneypot,
  validateSubmissionTiming,
} from '../../src/server/anti-abuse-service'
import { AuthError } from '../../src/server/auth-service'
import { castVoteSchema } from '../../src/lib/api/schemas'

const root = join(__dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('Tier 3: Single Choice Community Voting Engine', () => {
  it('enforces one upvote per project with no quadratic path', () => {
    const source = read('src/server/voting-service.ts')
    expect(source).not.toMatch(/QUADRATIC/)
    expect(source).not.toMatch(/calculateQuadraticCost/)
    expect(source).toMatch(/INVALID_SINGLE_CHOICE_VOTE/)
  })

  it('validates voting payloads via schema', () => {
    expect(
      castVoteSchema.safeParse({
        submissionId: '11111111-1111-1111-1111-111111111111',
        votes: 1,
      }).success,
    ).toBe(true)

    expect(
      castVoteSchema.safeParse({
        allocations: [
          { submissionId: '11111111-1111-1111-1111-111111111111', votes: 1 },
          { submissionId: '22222222-2222-2222-2222-222222222222', votes: 1 },
        ],
      }).success,
    ).toBe(true)

    expect(
      castVoteSchema.safeParse({
        allocations: [
          { submissionId: 'not-a-uuid', votes: 1 },
        ],
      }).success,
    ).toBe(false)
  })

  it('routes ballot toggles through the vote and reset endpoints', () => {
    const hook = read('components/event-page/use-voting-booth.ts')
    expect(hook).toMatch(/toggleUpvote/)
    expect(hook).toMatch(/method: 'DELETE'/)
    const booth = read('components/event-page/voting-booth-page.tsx')
    expect(booth).not.toMatch(/Quadratic/)
    expect(booth).not.toMatch(/Submit Ballot/)
  })

  it('toggles optimistically with no toasts and no screen refetch', () => {
    const hook = read('components/event-page/use-voting-booth.ts')
    expect(hook).toMatch(/setUpvoted\(next\)/)
    // Failed submits roll the button back instead of announcing an error.
    expect(hook).toMatch(/if \(!res\.ok\) setUpvoted\(prev\)/)
    expect(hook).not.toMatch(/setMessage/)
    expect(hook).not.toMatch(/Upvoted!/)
    const booth = read('components/event-page/voting-booth-page.tsx')
    expect(booth).not.toMatch(/message/)
    expect(booth).not.toMatch(/role=\{message/)
  })
})

describe('Tier 3: Anti-Abuse System', () => {
  describe('Honeypot Challenge', () => {
    it('accepts legitimate empty honeypot field', () => {
      expect(() => validateHoneypot('')).not.toThrow()
      expect(() => validateHoneypot(undefined)).not.toThrow()
    })

    it('rejects bot-filled honeypot challenge with 400 BOT_DETECTED', () => {
      expect(() => validateHoneypot('http://spam.org')).toThrow(AuthError)
      try {
        validateHoneypot('badbot')
      } catch (err) {
        expect((err as AuthError).code).toBe('BOT_DETECTED')
        expect((err as AuthError).status).toBe(400)
      }
    })

    it('rejects suspiciously fast bot submission timings', () => {
      const now = Date.now()
      expect(() => validateSubmissionTiming(now - 100, 700)).toThrow(AuthError)
      expect(() => validateSubmissionTiming(now - 1500, 700)).not.toThrow()
    })
  })

  describe('Local IP & Fingerprint Rate Limiting', () => {
    it('allows requests within threshold and blocks flooding', () => {
      const key = `test-ip-${Date.now()}`
      for (let i = 0; i < 5; i++) {
        expect(() => checkRateLimit(key, 5, 10_000)).not.toThrow()
      }
      expect(() => checkRateLimit(key, 5, 10_000)).toThrow('RATE_LIMITED')
    })

    it('tracks buckets independently per key', () => {
      const stamp = Date.now()
      expect(() => checkRateLimit(`fp-a-${stamp}`, 1, 10_000)).not.toThrow()
      expect(() => checkRateLimit(`fp-b-${stamp}`, 1, 10_000)).not.toThrow()
      expect(() => checkRateLimit(`fp-a-${stamp}`, 1, 10_000)).toThrow('RATE_LIMITED')
    })
  })

  describe('Voter Fingerprinting (HTTP client characteristics + IP)', () => {
    const makeRequest = (headers: Record<string, string>) =>
      new Request('http://localhost/api/events/e1/vote', { headers })

    it('is stable for identical clients', () => {
      const headers = {
        'x-forwarded-for': '203.0.113.7',
        'user-agent': 'Mozilla/5.0 Test',
        'accept-language': 'en-US',
      }
      expect(generateVoterFingerprint(makeRequest(headers), null)).toBe(
        generateVoterFingerprint(makeRequest(headers), null),
      )
    })

    it('changes when the IP changes', () => {
      const base = { 'user-agent': 'Mozilla/5.0 Test', 'accept-language': 'en-US' }
      const a = generateVoterFingerprint(makeRequest({ ...base, 'x-forwarded-for': '203.0.113.7' }), null)
      const b = generateVoterFingerprint(makeRequest({ ...base, 'x-forwarded-for': '203.0.113.8' }), null)
      expect(a).not.toBe(b)
    })

    it('changes when client characteristics change', () => {
      const base = { 'x-forwarded-for': '203.0.113.7', 'accept-language': 'en-US' }
      const a = generateVoterFingerprint(makeRequest({ ...base, 'user-agent': 'Browser/1' }), null)
      const b = generateVoterFingerprint(makeRequest({ ...base, 'user-agent': 'Browser/2' }), null)
      expect(a).not.toBe(b)
    })

    it('separates signed-in voters from anonymous ones on the same client', () => {
      const headers = { 'x-forwarded-for': '203.0.113.7', 'user-agent': 'Mozilla/5.0 Test' }
      const anon = generateVoterFingerprint(makeRequest(headers), null)
      const authed = generateVoterFingerprint(makeRequest(headers), 'user-1')
      expect(anon).not.toBe(authed)
    })
  })

  describe('Text Similarity & Duplicate Project Detection', () => {
    it('computes high similarity for identical and near-duplicate projects', () => {
      const p1 = {
        title: 'Nexus Decentralized Storage Platform',
        tagline: 'Store and manage encrypted data seamlessly',
        description: 'An offline-first platform built on postgres and nextjs with cryptographic hashing.',
      }
      const p2 = {
        title: 'Nexus Decentralized Storage Platform',
        tagline: 'Store and manage encrypted data seamlessly',
        description: 'An offline-first platform built on postgres and nextjs with cryptographic hashing.',
      }
      expect(calculateProjectSimilarity(p1, p2)).toBe(1.0)
    })

    it('detects near-identical plagiarism with high confidence', () => {
      const original = {
        title: 'Glass Signal Audio Visualizer',
        tagline: 'Realtime audio spectrum visualizer in WebGL',
        description: 'Audio visualizer that uses fast Fourier transforms in javascript and canvas.',
      }
      const copycat = {
        title: 'Glass Signal Audio Visualiser',
        tagline: 'Realtime audio spectrum visualizer in WebGL',
        description: 'Audio visualizer that uses fast Fourier transforms in javascript and canvas shaders.',
      }
      const score = calculateProjectSimilarity(original, copycat)
      expect(score).toBeGreaterThan(0.75)
    })

    it('returns low similarity for distinct projects', () => {
      const p1 = {
        title: 'Autonomous Solar Drone',
        tagline: 'Solar powered flight controller',
        description: 'Embedded C++ micro-controller telemetry for fixed-wing UAVs.',
      }
      const p2 = {
        title: 'FinTech Ledger Bookkeeper',
        tagline: 'Double-entry accounting on relational SQL',
        description: 'Postgres transactional accounting software with balance verification.',
      }
      expect(calculateProjectSimilarity(p1, p2)).toBeLessThan(0.2)
    })
  })
})

describe('Tier 3: Positional Bias Mitigation (Deterministic Seeded Shuffling)', () => {
  const items = [
    { id: '1', title: 'Aardvark project' },
    { id: '2', title: 'Beta project' },
    { id: '3', title: 'Charlie project' },
    { id: '4', title: 'Delta project' },
    { id: '5', title: 'Echo project' },
  ]

  it('produces identical deterministic order for the same seed', () => {
    const seed = 'session-token-xyz-123'
    const shuffled1 = seededOrder(items, seed)
    const shuffled2 = seededOrder(items, seed)
    expect(shuffled1.map((p) => p.id)).toEqual(shuffled2.map((p) => p.id))
  })

  it('produces different permutations for different seeds to remove alphabet bias', () => {
    const shuffledA = seededOrder(items, 'visitor-seed-1')
    const shuffledB = seededOrder(items, 'visitor-seed-999')
    expect(shuffledA.map((p) => p.id)).not.toEqual(items.map((p) => p.id))
    expect(shuffledA.map((p) => p.id)).not.toEqual(shuffledB.map((p) => p.id))
  })
})