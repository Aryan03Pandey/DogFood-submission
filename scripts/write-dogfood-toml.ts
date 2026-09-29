import 'dotenv/config'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, asc, eq } from 'drizzle-orm'
import { db, sql } from '../src/db'
import { eventRoles, events, users } from '../src/db/schema'
import { assignEventRole, createSession, findUserByEmail } from '../src/server/auth-service'
import { slugify } from '../src/lib/fixtures'

// Checker wiring for scripts/run.py (see docs/spec.md, "File 1").
//
// The checker never logs in: it attaches a working auth header per role.
// Session tokens are random per install and expire (7-day TTL), and row
// UUIDs differ per database — so no committed copy of .dogfood.toml can
// survive a reseed. This script mints fresh sessions for the four checker
// roles against the real seeded rows and writes the file, then prints the
// same block to the logs as a fallback for runs without the repo
// bind-mount (the compose `seed` service bind-mounts .dogfood.toml, so its
// write lands on the host file directly).
//
// Run after db:seed + db:fixtures (the compose `seed` service does this):
//   pnpm dogfood:toml            (local, DATABASE_URL=localhost…)
//   DOGFOOD_BASE_URL=http://localhost:3000 pnpm dogfood:toml

export interface DogfoodTomlInput {
  baseUrl: string
  organizerToken: string
  judgeAToken: string
  judgeBToken: string
  participantToken: string
  fixtureEventId: string
  judgeAUserId: string
}

// Pure render so the file shape is pinned by a unit test without a DB.
export function renderDogfoodToml(input: DogfoodTomlInput): string {
  return [
    '[portal]',
    `base_url = "${input.baseUrl}"`,
    '',
    '[tiers]',
    'claimed = ["T1", "T2", "T3", "T4"]',
    'pitch = "Dogfood 2026 hackathon portal."',
    '',
    '[auth]',
    `organizer   = "Cookie: dogfood_session=${input.organizerToken}"`,
    `judge_a     = "Cookie: dogfood_session=${input.judgeAToken}"`,
    `judge_b     = "Cookie: dogfood_session=${input.judgeBToken}"`,
    `participant = "Cookie: dogfood_session=${input.participantToken}"`,
    '',
    '[routes]',
    'gallery      = "/projects"',
    `submit       = "/api/events/${input.fixtureEventId}/submissions"`,
    'judge_scores = "/api/judge/scores"',
    `peer_scores  = "/api/judge/scores?judge=${input.judgeAUserId}"`,
    `csv_export   = "/api/export.csv?eventId=${input.fixtureEventId}"`,
    '',
  ].join('\n')
}

async function main(): Promise<void> {
  const baseUrl = process.env.DOGFOOD_BASE_URL ?? 'http://localhost:3000'

  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.slug, slugify('Sample Hack 2026')))
    .limit(1)
  if (!event) throw new Error('fixture event missing — run `pnpm db:fixtures` first.')

  const admin = await findUserByEmail('admin@local')
  const organizer = await findUserByEmail('organizer@local')
  const participant = await findUserByEmail('participant@local')
  if (!admin || !organizer || !participant) {
    throw new Error('seed users missing — run `pnpm db:seed` first.')
  }

  // The checker exports the fixture event as the organizer, so the seed
  // organizer needs an ORGANIZER mapping there (idempotent re-run: the
  // service upserts the same role).
  await assignEventRole({ actor: admin, eventId: event.id, targetUserId: organizer.id, role: 'ORGANIZER' })

  // The checker's two judges are the first two fixture judges in load
  // order — deterministic per fixture file, and both hold JUDGE mappings
  // plus real scores on the fixture event.
  const judges = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .innerJoin(eventRoles, eq(eventRoles.userId, users.id))
    .where(and(eq(eventRoles.eventId, event.id), eq(eventRoles.role, 'JUDGE')))
    .orderBy(asc(users.createdAt))
    .limit(2)
  if (judges.length < 2) throw new Error('fixture judges missing — re-run `pnpm db:fixtures` on a clean DB.')

  const [organizerSession, judgeASession, judgeBSession, participantSession] = await Promise.all([
    createSession(organizer.id),
    createSession(judges[0].id),
    createSession(judges[1].id),
    createSession(participant.id),
  ])

  const toml = renderDogfoodToml({
    baseUrl,
    organizerToken: organizerSession.token,
    judgeAToken: judgeASession.token,
    judgeBToken: judgeBSession.token,
    participantToken: participantSession.token,
    fixtureEventId: event.id,
    judgeAUserId: judges[0].id,
  })

  writeFileSync(join(process.cwd(), '.dogfood.toml'), toml)
  console.log('dogfood:toml wrote .dogfood.toml')
  console.log('--- .dogfood.toml block (already written to the file; copy only when running without the repo bind-mount) ---')
  console.log(toml)
  console.log(`--- judges: ${judges[0].email}, ${judges[1].email} (sessions expire in 7 days; re-run to refresh) ---`)
}

async function run(): Promise<void> {
  try {
    await main()
  } catch (error) {
    console.error('dogfood:toml failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  } finally {
    await sql.end()
  }
}

run()
