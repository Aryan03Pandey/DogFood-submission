import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, sql } from '../src/db'
import {
  events,
  eventRoles,
  judgeAssignments,
  judgeTracks,
  rubrics,
  scores,
  submissions,
  teamMembers,
  teams,
  tracks,
  users,
} from '../src/db/schema'
import { hashPassword } from '../src/server/auth-service'
import { generateInviteToken, deriveEventStatus } from '../src/db/schema'
import { hashInviteToken } from '../src/lib/auth'
import {
  checkFixtureIntegrity,
  parseFixtures,
  scoreTotal,
  slugify,
  type Fixtures,
} from '../src/lib/fixtures'

const FIXTURE_SLUG = slugify('Sample Hack 2026')
const DAY = 24 * 60 * 60 * 1000
const assignmentIds = new Map<string, string>()

// Fixture users can never log in: they share one random unknown password.
// Real credentials are created via the API or dogfood-cli.
async function throwawayPasswordHash(): Promise<string> {
  return hashPassword(randomBytes(24).toString('hex'))
}

async function load(fx: Fixtures): Promise<void> {
  const problems = checkFixtureIntegrity(fx)
  if (problems.length > 0) {
    throw new Error(`fixture integrity problems:\n- ${problems.join('\n- ')}`)
  }

  const close = new Date(fx.event.submissions_close).getTime()
  const dates = {
    registrationEnd: new Date(close - 30 * DAY),
    submissionDeadline: new Date(close),
    judgingEndTime: new Date(close + 10 * DAY),
    publicVotingEndTime: new Date(close + 17 * DAY),
  }
  const passwordHash = await throwawayPasswordHash()

  await db.transaction(async (tx) => {
    const [event] = await tx
      .insert(events)
      .values({
        title: fx.event.name,
        slug: FIXTURE_SLUG,
        status: deriveEventStatus({ status: 'SUBMISSION', ...dates }),
        submissionStart: new Date(close - 30 * DAY),
        ...dates,
      })
      .returning()
    const eventId = event.id

    // Users: judges keep name+email; members resolve by email.
    const userIds = new Map<string, string>()
    const emails = new Map<string, string>()
    fx.judges.forEach((j) => emails.set(j.email.toLowerCase(), j.name))
    // Members must never clobber a judge's name if an address ever appears
    // in both lists (the integrity check rejects such fixtures first; this
    // keeps the map truthful regardless of check ordering).
    fx.teams.forEach((t) =>
      t.members.forEach((m) => {
        const key = m.toLowerCase()
        if (!emails.has(key)) emails.set(key, '')
      }),
    )
    for (const [email, name] of emails) {
      const [user] = await tx
        .insert(users)
        .values({ email, name: name || null, passwordHash, role: 'PARTICIPANT' })
        .returning({ id: users.id })
      userIds.set(email, user.id)
    }

    const judgeIds = new Map(fx.judges.map((j) => [j.id, userIds.get(j.email.toLowerCase())!]))
    const judgeEmails = new Set(fx.judges.map((j) => j.email.toLowerCase()))
    await tx.insert(eventRoles).values([
      ...fx.judges.map((j) => ({ eventId, userId: judgeIds.get(j.id)!, role: 'JUDGE' as const })),
      ...[...emails.keys()]
        .filter((email) => !judgeEmails.has(email))
        .map((email) => ({ eventId, userId: userIds.get(email)!, role: 'PARTICIPANT' as const })),
    ])

    const trackIds = new Map<string, string>()
    for (const track of fx.tracks) {
      const [row] = await tx
        .insert(tracks)
        .values({ eventId, name: track.name, description: null })
        .returning({ id: tracks.id })
      trackIds.set(track.id, row.id)
    }

    for (const judge of fx.judges) {
      if (judge.tracks.length === 0) continue
      await tx.insert(judgeTracks).values(
        judge.tracks.map((trackId) => ({ trackId: trackIds.get(trackId)!, judgeId: judgeIds.get(judge.id)! })),
      )
    }

    await tx.insert(rubrics).values({
      eventId,
      title: 'Fixture rubric',
      criteriaJson: [
        { id: 'functionality', label: 'Functionality', weight: 1, minScore: 0, maxScore: 10, kind: 'int', step: 1 },
        { id: 'quality', label: 'Quality', weight: 1, minScore: 0, maxScore: 10, kind: 'int', step: 1 },
        { id: 'innovation', label: 'Innovation', weight: 1, minScore: 0, maxScore: 10, kind: 'int', step: 1 },
      ],
    })

    const teamIds = new Map<string, string>()
    for (const team of fx.teams) {
      const [row] = await tx
        .insert(teams)
        .values({ eventId, name: team.name, inviteCodeHash: hashInviteToken(generateInviteToken()) })
        .returning({ id: teams.id })
      teamIds.set(team.id, row.id)
      await tx.insert(teamMembers).values(
        team.members.map((email) => ({ teamId: row.id, userId: userIds.get(email.toLowerCase())! })),
      )
    }

    const submissionIds = new Map<string, string>()
    for (const project of fx.projects) {
      const [row] = await tx
        .insert(submissions)
        .values({
          teamId: teamIds.get(project.team)!,
          trackId: trackIds.get(project.track)!,
          title: project.title,
          tagline: project.summary,
          repoUrl: project.repo_url,
          isDraft: false,
          isHidden: false,
          submittedAt: new Date(project.submitted_at),
        })
        .returning({ id: submissions.id })
      submissionIds.set(project.id, row.id)
    }

    const seenAssignments = new Set<string>()
    for (const score of fx.scores) {
      const key = `${score.judge}:${score.project}`
      if (!seenAssignments.has(key)) {
        seenAssignments.add(key)
        const [assignment] = await tx
          .insert(judgeAssignments)
          .values({
            eventId,
            judgeId: judgeIds.get(score.judge)!,
            submissionId: submissionIds.get(score.project)!,
          })
          .returning({ id: judgeAssignments.id })
        // Stash the assignment id on the pair for the score insert below.
        assignmentIds.set(key, assignment.id)
      }
      await tx.insert(scores).values({
        assignmentId: assignmentIds.get(key)!,
        judgeId: judgeIds.get(score.judge)!,
        submissionId: submissionIds.get(score.project)!,
        rubricScoresJson: score.criteria,
        rawTotal: scoreTotal(score.criteria),
        comment: score.comment.trim() === '' ? null : score.comment,
      })
    }
  })
}

async function main(): Promise<void> {
  const raw = JSON.parse(readFileSync(join(process.cwd(), 'src', 'db', 'fixtures.json'), 'utf8'))
  const fx = parseFixtures(raw)

  const [existing] = await db.select({ id: events.id }).from(events).where(eq(events.slug, FIXTURE_SLUG)).limit(1)
  if (existing) {
    console.log(`load-fixtures: event "${FIXTURE_SLUG}" already populated, skipping.`)
    return
  }

  await load(fx)
  console.log(
    `load-fixtures: event "${FIXTURE_SLUG}" loaded ` +
      `(${fx.tracks.length} tracks, ${fx.judges.length} judges, ${fx.teams.length} teams, ` +
      `${fx.projects.length} submissions, ${fx.scores.length} scores).`,
  )
}

async function run(): Promise<void> {
  try {
    await main()
  } catch (error) {
    console.error('load-fixtures failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  } finally {
    await sql.end()
  }
}

run()
