import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '../src/db'
import { events, type EventRole, type UserRole } from '../src/db/schema'
import { assignEventRole, createUser, findUserByEmail, type AuthError } from '../src/server/auth-service'

// Documented offline-dev password for every seeded account. Local use only:
// production deployments must create real users via the API or dogfood-cli.
export const DEV_SEED_PASSWORD = 'DogfoodLocal1!'

const SEED_USERS: Array<{ email: string; role: UserRole; eventRole: EventRole | null; organization?: string }> = [
  { email: 'admin@local', role: 'SUPERADMIN', eventRole: null, organization: 'Dogfood HQ' },
  { email: 'organizer@local', role: 'PARTICIPANT', eventRole: 'ORGANIZER', organization: 'Dogfood HQ' },
  { email: 'judge1@local', role: 'PARTICIPANT', eventRole: 'JUDGE', organization: 'Track judges' },
  { email: 'participant@local', role: 'PARTICIPANT', eventRole: 'PARTICIPANT', organization: 'Community' },
]

async function ensureEvent() {
  const slug = 'dogfood-2026'
  const [existing] = await db.select().from(events).where(eq(events.slug, slug)).limit(1)
  if (existing) return existing
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const [event] = await db
    .insert(events)
    .values({
      title: 'Dogfood 2026',
      slug,
      status: 'REGISTRATION',
      registrationEnd: new Date(now + 30 * day),
      submissionStart: new Date(now + 30 * day),
      submissionDeadline: new Date(now + 60 * day),
      judgingEndTime: new Date(now + 70 * day),
      publicVotingEndTime: new Date(now + 77 * day),
    })
    .returning()
  return event
}

async function main() {
  const event = await ensureEvent()
  const admin = (await findUserByEmail('admin@local')) ?? (await createUser({ email: 'admin@local', password: DEV_SEED_PASSWORD, role: 'SUPERADMIN', organization: 'Dogfood HQ' }))
  for (const seed of SEED_USERS) {
    const user = (await findUserByEmail(seed.email)) ?? (await createUser({ email: seed.email, password: DEV_SEED_PASSWORD, role: seed.role, organization: seed.organization }))
    if (seed.eventRole) {
      await assignEventRole({ actor: admin, eventId: event.id, targetUserId: user.id, role: seed.eventRole }).catch((error: AuthError) => {
        throw error
      })
    }
    console.log(`seed: ${user.email} (${user.role}${seed.eventRole ? `, ${seed.eventRole} @ ${event.slug}` : ''})`)
  }
  console.log(`seed: event "${event.slug}" ready. Dev password for seeded accounts: ${DEV_SEED_PASSWORD}`)
}

main().catch((error) => {
  console.error('seed failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
