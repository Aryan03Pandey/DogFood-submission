import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  flagSchema,
  judgeRemovalSchema,
  rubricSchema,
  scoreClearSchema,
} from '../../src/lib/api/judging-schemas'
import {
  loadBalancedKCover,
  minMaxNormalize,
  rotateOrder,
  trimmedMean,
  zScoreNormalize,
} from '../../src/lib/judging/normalization'
import { visibleMenuGroups } from '../../src/lib/user-menu'
import {
  apiClearJudgeScore,
  apiFlagSubmission,
  apiGenerateAssignments,
  apiInviteJudge,
  apiJudgeQueue,
  apiJudgeSubmission,
  apiListJudgeCandidates,
  apiListTracks,
  apiRemoveJudge,
  apiSetJudgeTracks,
  apiSaveJudgeScore,
  apiSaveRubric,
  apiUnflagSubmission,
} from '../../lib/api-client'

const root = join(__dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('judging rubric schemas', () => {
  const base = {
    id: 'clarity',
    label: 'Clarity',
    weight: 1,
    minScore: 0,
    maxScore: 10,
    kind: 'int' as const,
    step: 1,
  }

  it('accepts bounded int and float criteria', () => {
    expect(
      rubricSchema.safeParse({
        title: 'R',
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        criteriaJson: [base, { ...base, id: 'ux', kind: 'float', step: 0.5 }],
      }).success,
    ).toBe(true)
  })

  it('rejects inverted bounds, bad steps, and int fractions', () => {
    const eventId = '123e4567-e89b-12d3-a456-426614174000'
    const bad = (criterion: object) =>
      rubricSchema.safeParse({ title: 'R', eventId, criteriaJson: [{ ...base, ...criterion }] })
        .success
    expect(bad({ maxScore: 0 })).toBe(false)
    expect(bad({ kind: 'float', step: 5 })).toBe(false)
    expect(bad({ kind: 'float', step: 0.001 })).toBe(false)
    expect(bad({ kind: 'int', step: 0.5 })).toBe(false)
    expect(bad({ weight: -1 })).toBe(false)
  })

  it('validates flag and removal payloads', () => {
    expect(flagSchema.safeParse({ assignmentId: 'nope', reason: 'OTHER' }).success).toBe(false)
    expect(
      flagSchema.safeParse({
        assignmentId: '123e4567-e89b-12d3-a456-426614174000',
        reason: 'NOPE',
      }).success,
    ).toBe(false)
    expect(
      flagSchema.safeParse({
        assignmentId: '123e4567-e89b-12d3-a456-426614174000',
        reason: 'PLAGIARISM',
        comment: 'x'.repeat(1001),
      }).success,
    ).toBe(false)
    expect(
      judgeRemovalSchema.safeParse({
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        password: '',
      }).success,
    ).toBe(false)
    expect(
      scoreClearSchema.safeParse({ assignmentId: '123e4567-e89b-12d3-a456-426614174000' }).success,
    ).toBe(true)
  })
})

describe('assignment engines', () => {
  it('rotates deterministically with wraparound', () => {
    expect(rotateOrder(['a', 'b', 'c'], 0)).toEqual(['a', 'b', 'c'])
    expect(rotateOrder(['a', 'b', 'c'], 1)).toEqual(['b', 'c', 'a'])
    expect(rotateOrder(['a', 'b', 'c'], 4)).toEqual(['b', 'c', 'a'])
    expect(rotateOrder(['a', 'b', 'c'], -1)).toEqual(['c', 'a', 'b'])
    expect(rotateOrder([], 3)).toEqual([])
  })

  it('k-cover guarantees minimum reviews with balanced loads', () => {
    const assignments = loadBalancedKCover(['s1', 's2', 's3'], ['j1', 'j2'], 2)
    const perSubmission = new Map<string, Set<string>>()
    const loads = new Map<string, number>()
    for (const entry of assignments) {
      perSubmission.set(entry.submissionId, (perSubmission.get(entry.submissionId) ?? new Set()).add(entry.judgeId))
      loads.set(entry.judgeId, (loads.get(entry.judgeId) ?? 0) + 1)
    }
    expect(assignments).toHaveLength(6)
    for (const judges of perSubmission.values()) expect(judges.size).toBe(2)
    expect(Math.abs((loads.get('j1') ?? 0) - (loads.get('j2') ?? 0))).toBeLessThanOrEqual(1)
  })

  it('k-cover degrades honestly with a single judge', () => {
    const assignments = loadBalancedKCover(['s1', 's2'], ['j1'], 3)
    expect(assignments).toHaveLength(2)
    expect(new Set(assignments.map((entry) => entry.submissionId)).size).toBe(2)
  })

  it('normalization handles degenerate distributions', () => {
    // Zero-variance judge collapses to 0 instead of NaN.
    const z = zScoreNormalize([
      { judgeId: 'j1', submissionId: 's1', value: 5 },
      { judgeId: 'j1', submissionId: 's2', value: 5 },
    ])
    expect(z.every((entry) => entry.value === 0)).toBe(true)
    // Equal bounds land mid-scale instead of dividing by zero.
    expect(minMaxNormalize([7, 7])).toEqual([50, 50])
    // Fewer than 5 reviews fall back to the plain mean.
    expect(trimmedMean([2, 4])).toBe(3)
    expect(trimmedMean([5, 1, 9, 3, 7])).toBe(5)
  })
})

describe('judging service contracts', () => {
  const service = () => read('src/server/judging-service.ts')

  it('bans same-event participants from judging', () => {
    expect(service()).toMatch(/PARTICIPANT_IS_JUDGE/)
  })

  it('removes judges password-confirmed with cascade and regen', () => {
    const source = service()
    expect(source).toMatch(/export async function removeJudge\(/)
    expect(source).toMatch(/INVALID_CREDENTIALS/)
    expect(source).toMatch(/JUDGE_NOT_FOUND/)
    expect(source).toMatch(/generateAssignments\(actor, eventId\)/)
    expect(source).toMatch(/orphaned/)
  })

  it('validates scores against criterion bounds server-side', () => {
    const source = service()
    expect(source).toMatch(/criterionAccepts/)
    expect(source).toMatch(/INVALID_RUBRIC_SCORES/)
    expect(source).toMatch(/export async function clearScore\(/)
    expect(source).toMatch(/export async function flagSubmission\(/)
    expect(source).toMatch(/export async function unflagSubmission\(/)
    expect(read('src/db/schema.ts')).toMatch(/flagAssignmentUnique/)
  })

  it('scopes judges to their own assignments at query level', () => {
    const source = service()
    expect(source).toMatch(/eq\(judgeAssignments\.judgeId, actor\.id\)/)
    expect(source).toMatch(/assignment\.judgeId !== actor\.id/)
    expect(source).toMatch(/FORBIDDEN/)
  })

  it('omits team identity under double-blind', () => {
    const source = service()
    expect(source).toMatch(/\.\.\.\(!row\.doubleBlind/)
    expect(source).toMatch(/doubleBlindJudging/)
  })

  it('strips the team handle from blind submission detail', () => {
    const source = service()
    // teamId alone identifies the team, so the blind payload whitelists
    // fields instead of spreading the raw submission row.
    expect(source).toMatch(/blindSubmission/)
    expect(source).toMatch(/submission: row\.doubleBlind \? blindSubmission : row\.submission/)
  })

  it('gates the judge team block on the blind flag', () => {
    const dashboard = read('components/judge/judge-dashboard.tsx')
    expect(dashboard).toMatch(/!detail\.event\.doubleBlindJudging && detail\.team/)
    expect(dashboard).toMatch(/hidden for blind review/)
  })

  it('streams CSV in keyset batches instead of loading all rows', () => {
    const source = service()
    expect(source).toMatch(/export async function\* streamCsvRows\(/)
    expect(source).toMatch(/orderBy\(asc\(judgeAssignments\.id\)\)/)
    expect(source).toMatch(/\.limit\(batchSize\)/)
    expect(source).not.toMatch(/export async function getCsvRows\(/)
  })

  it('detaches non-cascading track references on event delete', () => {
    const source = read('src/server/dashboard-service.ts')
    expect(source).toMatch(/set\({ trackId: null }\)/)
    expect(source).toMatch(/inArray\(submissions\.trackId/)
    expect(source).toMatch(/inArray\(prizes\.trackId/)
  })

  it('selects the organizer-chosen assignment algorithm', () => {
    const source = service()
    expect(source).toMatch(/event\.assignmentAlgorithm/)
    expect(source).toMatch(/ROUND_ROBIN/)
    expect(source).toMatch(/rotateOrder\(rotation, pointer\)/)
  })
})

describe('judging api controllers', () => {
  function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => ({
        ok: true,
        status: 200,
        json: async () => handler(url, init),
      })),
    )
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('invites, lists, removes, rubrics, generates, and scores through their endpoints', async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = []
    stubFetch((url, init) => {
      seen.push({ url, init })
      if (url.startsWith('/api/organizer/judges?')) return { eventId: 'e1', candidates: [] }
      if (url.startsWith('/api/judge/queue')) return { assignments: [] }
      return { ok: true }
    })
    await apiInviteJudge('e1', 'u1')
    await apiListJudgeCandidates('e1', 'ada')
    await apiRemoveJudge('e1', 'u1', 'pw')
    await apiSaveRubric({
      eventId: 'e1',
      title: 'R',
      criteriaJson: [{ id: 'c', label: 'C', weight: 1, minScore: 0, maxScore: 5 }],
    })
    await apiGenerateAssignments('e1')
    await apiJudgeQueue('e1')
    await apiJudgeSubmission('s1')
    await apiSaveJudgeScore({ assignmentId: 'a1', rubricScoresJson: { c: 4 } })
    await apiClearJudgeScore('a1')
    await apiFlagSubmission({ assignmentId: 'a1', reason: 'OTHER' })
    await apiUnflagSubmission('a1')
    expect(seen.map((entry) => `${entry.init?.method} ${entry.url}`)).toEqual([
      'POST /api/organizer/judges',
      'undefined /api/organizer/judges?eventId=e1&q=ada',
      'DELETE /api/organizer/judges',
      'POST /api/organizer/rubrics',
      'POST /api/organizer/assignments/generate',
      'undefined /api/judge/queue?eventId=e1',
      'undefined /api/judge/submissions/s1',
      'POST /api/judge/scores',
      'DELETE /api/judge/scores',
      'POST /api/judge/flags',
      'DELETE /api/judge/flags',
    ])
    expect(JSON.parse(String(seen[2].init?.body))).toEqual({ eventId: 'e1', userId: 'u1', password: 'pw' })
  })

  it('qualifies judges per track through their endpoint', async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = []
    stubFetch((url, init) => {
      seen.push({ url, init })
      if (url === '/api/events/e1/tracks') return { eventId: 'e1', tracks: [] }
      return { judgeId: 'u1', trackIds: ['t1'] }
    })
    await apiListTracks('e1')
    await apiSetJudgeTracks('e1', 'u1', ['t1'])
    expect(seen.map((entry) => `${entry.init?.method} ${entry.url}`)).toEqual([
      'undefined /api/events/e1/tracks',
      'POST /api/organizer/judges/u1/tracks',
    ])
    expect(JSON.parse(String(seen[1].init?.body))).toEqual({ eventId: 'e1', trackIds: ['t1'] })
  })
})

describe('judging data-leak guards', () => {
  it('shows Judge Dashboard only to judges', () => {
    const labels = (groups: ReturnType<typeof visibleMenuGroups>) => groups.flat().map((item) => item.label)
    expect(labels(visibleMenuGroups('PARTICIPANT', false, true))).toContain('Judge Dashboard')
    expect(labels(visibleMenuGroups('PARTICIPANT', false, false))).not.toContain('Judge Dashboard')
    expect(labels(visibleMenuGroups('PARTICIPANT', true, false))).not.toContain('Judge Dashboard')
    expect(labels(visibleMenuGroups('SUPERADMIN', true, false))).not.toContain('Judge Dashboard')
  })

  it('denies cross-judge score reads at the service boundary', () => {
    const source = read('src/server/judging-service.ts')
    // ?judge=<other> requires a managed event; ordinary judges hit 403.
    expect(source).toMatch(/managedEvents\.includes\(row\.eventId\)/)
    // Score writes and clears both re-check assignment ownership.
    expect(source).toMatch(/eq\(scores\.assignmentId, assignmentId\)/)
  })

  it('keeps flags and scores out of other judges’ payloads', () => {
    const source = read('src/server/judging-service.ts')
    // Queue exposes only the caller's own scored/flagged state, never values.
    expect(source).toMatch(/scored: row\.scored !== null/)
    // Detail read carries only the caller's own score and flag.
    expect(source).toMatch(/ownScore/)
    expect(source).toMatch(/ownFlag/)
    // Assigned-submission read is gated on an assignment row for the caller.
    expect(source).toMatch(/eq\(judgeAssignments\.judgeId, actor\.id\)/)
  })

  it('routes reject forged and cross-event judging requests', () => {
    expect(read('app/api/judge/scores/route.ts')).toMatch(/saveJudgeScore\(session\.user, body\)/)
    expect(read('app/api/judge/flags/route.ts')).toMatch(/flagSubmission\(session\.user, body\)/)
    expect(read('app/api/judge/submissions/[id]/route.ts')).toMatch(
      /getAssignedSubmission\(session\.user/,
    )
    expect(read('app/api/organizer/judges/route.ts')).toMatch(/removeJudge\(session\.user/)
    // CSV requires a managed event (or owned scope) before streaming.
    expect(read('src/server/judging-service.ts')).toMatch(/getManagedEventIds\(actor, eventId\)/)
  })
})

describe('judging sample seed', () => {
  const seed = () => read('scripts/seed-judging-sample.ts')

  it('cycles user organizations so same_org conflicts stay partial', () => {
    expect(seed()).toMatch(/orgFor/)
    expect(seed()).not.toMatch(/organization: 'Sample Org'/)
  })

  it('backfills organizations for users reused across re-runs', () => {
    expect(seed()).toMatch(/existing\.organization !== orgFor\(n\)/)
  })

  it('keeps author identity out of seeded submission content', () => {
    // Descriptions render on the judge dashboard; an embedded email would
    // defeat double-blind even with team redaction in place.
    expect(seed()).not.toMatch(/by \$\{email/)
  })
})

describe('judging ui contracts', () => {
  it('organizer judging tab covers judges, rubric, engines, assignments', () => {
    const panel = read('components/console/dashboard/judging-panel.tsx')
    expect(panel).toMatch(/JudgesManager/)
    expect(panel).toMatch(/RubricBuilder/)
    expect(panel).toMatch(/AlgorithmsForm/)
    expect(panel).toMatch(/AssignmentsPanel/)
    const judges = read('components/console/judging/judges-manager.tsx')
    expect(judges).toMatch(/participates in this event/)
    expect(judges).toMatch(/Confirm remove/)
    expect(judges).toMatch(/reassigned/)
    expect(judges).toMatch(/Current judges/)
    expect(judges).toMatch(/refreshRoster/)
    // Track qualification is editable in the UI: judges without a track
    // link are ineligible for every submission, so the picker wires the
    // existing setJudgeTracks endpoint into the roster.
    expect(judges).toMatch(/apiSetJudgeTracks/)
    expect(judges).toMatch(/Save tracks/)
    expect(judges).toMatch(/will not receive assignments/)
    expect(read('src/server/judging-service.ts')).toMatch(/innerJoin\(judgeTracks/)
    // No remount-with-stale-props: resync comes from the server instead.
    expect(read('components/console/dashboard/judging-panel.tsx')).not.toMatch(/key=\{version\}/)
    const rubric = read('components/console/judging/rubric-builder.tsx')
    expect(rubric).toMatch(/Stable ID/)
    expect(rubric).toMatch(/Step size/)
    expect(rubric).toMatch(/Whole numbers/)
    const engines = read('components/console/judging/algorithms-form.tsx')
    expect(engines).toMatch(/Round-robin/)
    expect(engines).toMatch(/Double-blind/)
    expect(engines).toMatch(/No changes — the form matches the saved settings/)
    // Judging settings stay editable when live: the allowlist carries them.
    const service = read('src/server/event-service.ts')
    for (const key of ['judgesPerSubmission', 'doubleBlindJudging', 'assignmentAlgorithm', 'normalization']) {
      expect(service).toMatch(new RegExp(`"${key}"`))
    }
    const assignments = read('components/console/judging/assignments-panel.tsx')
    expect(assignments).toMatch(/Generate assignments/)
    expect(assignments).toMatch(/Export CSV/)
    expect(assignments).toMatch(/Judge progress/)
  })

  it('judge dashboard lays out queue, detail, and scoring with asset embeds', () => {
    const dashboard = read('components/judge/judge-dashboard.tsx')
    expect(dashboard).toMatch(/lg:grid-cols-\[260px_minmax\(0,1fr\)_320px\]/)
    expect(dashboard).toMatch(/Scored/)
    expect(dashboard).toMatch(/Not scored/)
    expect(dashboard).toMatch(/<SubmissionAssets/)
    const assets = read('components/submission/submission-assets.tsx')
    expect(assets).toMatch(/<video/)
    expect(assets).toMatch(/<iframe/)
    expect(assets).toMatch(/Open in new tab|Open <ExternalLink/)
    const scoring = read('components/judge/scoring-panel.tsx')
    expect(scoring).toMatch(/cannot be undone/)
    expect(scoring).toMatch(/Confirm flag/)
    expect(scoring).toMatch(/step=\{kind === 'float' \? step : 1\}/)
    const page = read('app/judge/page.tsx')
    expect(page).toMatch(/judgesAnyEvent/)
    expect(page).toMatch(/not judging any event/)
    // Judge routes render inside the shared chrome (navbar + footer) via
    // their own layout, like every other section.
    expect(read('app/judge/layout.tsx')).toMatch(/SiteChrome/)
  })
})
