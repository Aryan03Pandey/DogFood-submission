import { z } from 'zod'

// Alignment layer between src/db/fixtures.json (sample competition data) and
// the Drizzle schema. The fixture uses short string ids (evt_01, trk_01, …)
// while the schema uses uuid primary keys, so this module parses the fixture,
// maps every record onto its table-row shape, and verifies referential
// integrity — all without touching the database, so tests can prove the
// schema actually holds the sample data.
//
// Field mapping notes:
// - event.name -> events.title; events.slug is slugified from the name and
//   events.submissionDeadline comes from submissions_close. Remaining phase
//   dates are a loader concern (the fixture only fixes the deadline).
// - tracks carry no event link (single-event fixture); the loader attaches
//   them to the fixture event.
// - judges -> users (name + email kept) with a JUDGE event role, plus one
//   judge_tracks row per declared track (track expertise).
// - teams -> teams + users resolved by member email (no fixture ids there)
//   with a PARTICIPANT event role and team_members rows (all MEMBER — the
//   fixture names no leader).
// - projects -> submissions with summary mapped to tagline (all fixture
//   summaries fit the 140-char limit), isDraft=false, isHidden=false.
// - scores -> scores with rawTotal computed as the criteria sum, plus one
//   synthesized judge_assignments row per (judge, project) pair, since the
//   fixture scores directly without an assignment step.

const fixtureEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  submissions_close: z.string().datetime({ offset: true }),
})

const fixtureTrackSchema = z.object({ id: z.string(), name: z.string() })

const fixtureJudgeSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  tracks: z.array(z.string()),
})

const fixtureTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  members: z.array(z.string()).min(1),
})

const fixtureProjectSchema = z.object({
  id: z.string(),
  team: z.string(),
  track: z.string(),
  title: z.string(),
  summary: z.string().max(140),
  repo_url: z.string().url(),
  submitted_at: z.string().datetime({ offset: true }),
})

const fixtureScoreSchema = z.object({
  judge: z.string(),
  project: z.string(),
  criteria: z.record(z.string(), z.number().int()),
  comment: z.string(),
})

export const fixturesSchema = z.object({
  event: fixtureEventSchema,
  tracks: z.array(fixtureTrackSchema).min(1),
  judges: z.array(fixtureJudgeSchema),
  teams: z.array(fixtureTeamSchema),
  projects: z.array(fixtureProjectSchema),
  scores: z.array(fixtureScoreSchema),
})

export type Fixtures = z.infer<typeof fixturesSchema>

export function parseFixtures(raw: unknown): Fixtures {
  return fixturesSchema.parse(raw)
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Every dangling reference or duplicate identity in the fixture, as strings.
// Empty means the fixture loads cleanly onto the schema.
export function checkFixtureIntegrity(fx: Fixtures): string[] {
  const problems: string[] = []
  const trackIds = new Set(fx.tracks.map((t) => t.id))
  const teamIds = new Set(fx.teams.map((t) => t.id))
  const projectIds = new Set(fx.projects.map((p) => p.id))
  const judgeIds = new Set(fx.judges.map((j) => j.id))

  const seenIds = new Map<string, string>()
  const claimId = (id: string, where: string) => {
    if (seenIds.has(id)) problems.push(`duplicate id ${id} (${seenIds.get(id)} and ${where})`)
    else seenIds.set(id, where)
  }
  claimId(fx.event.id, 'event')
  fx.tracks.forEach((t) => claimId(t.id, `track ${t.id}`))
  fx.judges.forEach((j) => claimId(j.id, `judge ${j.id}`))
  fx.teams.forEach((t) => claimId(t.id, `team ${t.id}`))
  fx.projects.forEach((p) => claimId(p.id, `project ${p.id}`))

  const seenEmails = new Map<string, string>()
  const claimEmail = (email: string, where: string) => {
    const key = email.toLowerCase()
    if (seenEmails.has(key)) problems.push(`duplicate email ${email} (${seenEmails.get(key)} and ${where})`)
    else seenEmails.set(key, where)
  }
  fx.judges.forEach((j) => claimEmail(j.email, `judge ${j.id}`))
  fx.teams.forEach((t) => t.members.forEach((m) => claimEmail(m, `team ${t.id}`)))

  fx.judges.forEach((j) =>
    j.tracks.forEach((trackId) => {
      if (!trackIds.has(trackId)) problems.push(`judge ${j.id} references unknown track ${trackId}`)
    }),
  )
  fx.projects.forEach((p) => {
    if (!teamIds.has(p.team)) problems.push(`project ${p.id} references unknown team ${p.team}`)
    if (!trackIds.has(p.track)) problems.push(`project ${p.id} references unknown track ${p.track}`)
  })
  fx.scores.forEach((s, index) => {
    if (!judgeIds.has(s.judge)) problems.push(`score #${index} references unknown judge ${s.judge}`)
    if (!projectIds.has(s.project)) problems.push(`score #${index} references unknown project ${s.project}`)
  })
  return problems
}

export interface FixtureRowCounts {
  users: number
  tracks: number
  teams: number
  teamMembers: number
  submissions: number
  judgeTracks: number
  judgeAssignments: number
  scores: number
}

// Row counts the fixture maps onto (uuids are generated at load time, so
// only counts are asserted here): every judge and every team member becomes
// a user; every score synthesizes its judge_assignment.
export function countFixtureRows(fx: Fixtures): FixtureRowCounts {
  const emails = new Set<string>()
  fx.judges.forEach((j) => emails.add(j.email.toLowerCase()))
  fx.teams.forEach((t) => t.members.forEach((m) => emails.add(m.toLowerCase())))
  const assignmentPairs = new Set(fx.scores.map((s) => `${s.judge}:${s.project}`))
  return {
    users: emails.size,
    tracks: fx.tracks.length,
    teams: fx.teams.length,
    teamMembers: fx.teams.reduce((sum, t) => sum + t.members.length, 0),
    submissions: fx.projects.length,
    judgeTracks: fx.judges.reduce((sum, j) => sum + j.tracks.length, 0),
    judgeAssignments: assignmentPairs.size,
    scores: fx.scores.length,
  }
}

export function scoreTotal(criteria: Record<string, number>): number {
  return Object.values(criteria).reduce((sum, value) => sum + value, 0)
}
