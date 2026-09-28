import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkFixtureIntegrity,
  countFixtureRows,
  parseFixtures,
  scoreTotal,
  slugify,
} from '../../src/lib/fixtures'

const root = join(__dirname, '..', '..')
const raw = JSON.parse(readFileSync(join(root, 'src', 'db', 'fixtures.json'), 'utf8'))
const fx = parseFixtures(raw)

describe('fixtures align with the schema', () => {
  it('parses the sample fixture against the contract shapes', () => {
    expect(fx.event.name).toBe('Sample Hack 2026')
    expect(fx.tracks).toHaveLength(8)
    expect(fx.judges).toHaveLength(30)
    expect(fx.teams).toHaveLength(40)
    expect(fx.projects).toHaveLength(41)
    expect(fx.scores).toHaveLength(126)
  })

  it('has no dangling references or duplicate identities', () => {
    expect(checkFixtureIntegrity(fx)).toEqual([])
  })

  it('maps onto table rows every new column can hold', () => {
    // users.name holds all 30 judge names; team members are email-only.
    expect(fx.judges.every((j) => j.name.length > 0)).toBe(true)
    // Every score carries the comment field (blank ones load as NULL);
    // criteria sum feeds rawTotal.
    expect(fx.scores.every((s) => typeof s.comment === 'string')).toBe(true)
    expect(fx.scores.filter((s) => s.comment.trim().length > 0).length).toBeGreaterThan(0)
    expect(scoreTotal(fx.scores[0].criteria)).toBe(
      fx.scores[0].criteria.functionality + fx.scores[0].criteria.quality + fx.scores[0].criteria.innovation,
    )
    // Project summaries fit the tagline they map onto.
    expect(Math.max(...fx.projects.map((p) => p.summary.length))).toBeLessThanOrEqual(140)
  })

  it('derives a usable event slug and deadline', () => {
    expect(slugify(fx.event.name)).toBe('sample-hack-2026')
    expect(new Date(fx.event.submissions_close).toISOString()).toBe('2026-03-01T18:00:00.000Z')
  })

  it('counts rows consistently with the schema relations', () => {
    const counts = countFixtureRows(fx)
    // 30 judges + 91 distinct member emails, all unique.
    expect(counts.users).toBe(121)
    expect(counts.judgeTracks).toBe(fx.judges.reduce((sum, j) => sum + j.tracks.length, 0))
    expect(counts.teamMembers).toBe(fx.teams.reduce((sum, t) => sum + t.members.length, 0))
    expect(counts.judgeAssignments).toBeLessThanOrEqual(fx.scores.length)
    expect(counts.submissions).toBe(fx.projects.length)
  })
})
