import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '../src/db'
import { events, submissions, users } from '../src/db/schema'
import { postComment } from '../src/server/comment-service'
import { castVote } from '../src/server/voting-service'
import {
  assignEventRole,
  createUser,
  findUserByEmail,
} from '../src/server/auth-service'
import { deleteEvent } from '../src/server/dashboard-service'
import {
  createEvent,
  createTrack,
  publishEvent,
  registerForEvent,
} from '../src/server/event-service'
import { saveRubric } from '../src/server/judging-service'
import { createDraft, updateDraft } from '../src/server/submission-service'
import { finalizeSubmission } from '../src/server/team-service'
import { DEV_SEED_PASSWORD } from './seed'

// Repeatable judging-flow sample data (docs/JUDGING.md test loop):
//   DATABASE_URL=... npm run db:judging-sample
//
// Rebuilds from scratch on every run: Event-test-1 and Event-test-2 (both
// left in JUDGING phase) plus Event-test-3 (left in PUBLIC_VOTING phase
// with single-choice ballots, comments, and a duplicate pair for the Tier-3
// voting + engagement flow), plus 50 users with disjoint role sets —
// organizers are never participants in the event they organize — and one
// finalized submission per participant per event. Judges are deliberately
// NOT seeded so adding judges + allocation + normalization stay manual test
// actions. Safe to run again and again: existing sample events are deleted
// first (cascades), users are reused by email.

const DAY = 24 * 60 * 60 * 1000
const iso = (shiftMs: number) => new Date(Date.now() + shiftMs)

const pad = (n: number) => String(n).padStart(2, '0')
const email = (n: number) => `testuser${pad(n)}@local`

// Role blocks (50 users): E1-only participants 1-12, E2-only 13-24, both
// 25-32, E1-only organizers 33-36, E2-only organizers 37-40, both-events
// organizers 41-43, uninvolved 44-50.
const E1_ONLY = range(1, 12)
const E2_ONLY = range(13, 24)
const BOTH_PART = range(25, 32)
const ORG_E1 = range(33, 36)
const ORG_E2 = range(37, 40)
const ORG_BOTH = range(41, 43)
const NEITHER = range(44, 50)

function range(from: number, to: number): number[] {
  const out: number[] = []
  for (let n = from; n <= to; n++) out.push(n)
  return out
}

const FIRST = [
  'Aarav', 'Anaya', 'Arjun', 'Aisha', 'Aditya', 'Diya', 'Ishaan', 'Kavya', 'Krishna', 'Meera',
  'Nikhil', 'Priya', 'Rahul', 'Riya', 'Rohan', 'Sanya', 'Varun', 'Vivaan', 'Zara', 'Kabir',
  'Navya', 'Om', 'Pari', 'Qasim', 'Rhea', 'Samar', 'Tara', 'Uday', 'Veda', 'Yash',
  'Zoya', 'Aman', 'Bhavna', 'Chetan', 'Divya', 'Eshan', 'Farah', 'Gaurav', 'Heena', 'Imran',
  'Jaya', 'Karan', 'Lata', 'Manav', 'Neha', 'Onkar', 'Pooja', 'Raj', 'Simran', 'Tanvi',
]
const LAST = [
  'Sharma', 'Verma', 'Patel', 'Iyer', 'Khan', 'Gupta', 'Singh', 'Nair', 'Reddy', 'Mehta',
]

// Organizations cycle across users so the generate-time same_org heuristic
// only conflicts a judge with same-org teams (a handful) instead of every
// team. A single shared org made every judge conflicted with every team,
// so Generate assignments created 0 assignments for 20 submissions.
const orgFor = (n: number) => `Org ${((n - 1) % 4) + 1}`

async function ensureUser(n: number) {
  const existing = await findUserByEmail(email(n))
  // Users persist across re-runs: backfill the cycled org so an older
  // single-org DB is repaired by running the seed again.
  if (existing) {
    if (existing.organization !== orgFor(n))
      await db.update(users).set({ organization: orgFor(n) }).where(eq(users.id, existing.id))
    return (await findUserByEmail(email(n)))!
  }
  const user = await createUser({
    email: email(n),
    password: DEV_SEED_PASSWORD,
    organization: orgFor(n),
  })
  await db
    .update(users)
    .set({
      firstName: FIRST[(n - 1) % FIRST.length],
      lastName: LAST[(n - 1) % LAST.length],
      profession: n % 2 === 0 ? 'STUDENT' : 'PROFESSIONAL',
    })
    .where(eq(users.id, user.id))
  return (await findUserByEmail(email(n)))!
}

async function resetEvent(slug: string) {
  const admin = (await findUserByEmail('admin@local'))!
  const [row] = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug)).limit(1)
  if (row) await deleteEvent(admin, row.id, DEV_SEED_PASSWORD)
}

async function main() {
  const admin = (await findUserByEmail('admin@local')) ?? (await createUser({
    email: 'admin@local',
    password: DEV_SEED_PASSWORD,
    role: 'SUPERADMIN',
    organization: 'Dogfood HQ',
  }))

  console.log('Rebuilding judging sample data...')
  await resetEvent('Event-test-1')
  await resetEvent('Event-test-2')
  await resetEvent('Event-test-3')

  const ids = new Map<number, string>()
  for (let n = 1; n <= 50; n++) {
    const user = await ensureUser(n)
    ids.set(n, user.id)
  }
  console.log('50 users ready (password for all: the dev seed password).')

  const specs = [
    {
      slug: 'Event-test-1',
      title: 'Event-test-1',
      judgesPerSubmission: 2,
      assignmentAlgorithm: 'K_COVER' as const,
      normalization: 'RAW_MEAN' as const,
      doubleBlindJudging: true,
      participants: [...E1_ONLY, ...BOTH_PART],
      organizers: [...ORG_E1, ...ORG_BOTH],
    },
    {
      slug: 'Event-test-2',
      title: 'Event-test-2',
      judgesPerSubmission: 3,
      assignmentAlgorithm: 'ROUND_ROBIN' as const,
      normalization: 'Z_SCORE' as const,
      doubleBlindJudging: false,
      participants: [...E2_ONLY, ...BOTH_PART],
      organizers: [...ORG_E2, ...ORG_BOTH],
    },
  ]

  for (const spec of specs) {
    const event = await createEvent(admin, {
      title: spec.title,
      slug: spec.slug,
      participationType: 'INDIVIDUAL',
      format: 'ONLINE',
      judgesPerSubmission: spec.judgesPerSubmission,
      assignmentAlgorithm: spec.assignmentAlgorithm,
      normalization: spec.normalization,
      doubleBlindJudging: spec.doubleBlindJudging,
      registrationEnd: iso(2 * DAY),
      submissionStart: iso(3 * DAY),
      submissionDeadline: iso(10 * DAY),
      judgingStart: iso(11 * DAY),
      judgingEndTime: iso(18 * DAY),
      announcementDate: iso(19 * DAY),
    })
    const trackA = await createTrack(admin, event.id, { name: 'AI' })
    const trackB = await createTrack(admin, event.id, { name: 'Web' })
    await saveRubric(admin, {
      eventId: event.id,
      title: 'Sample rubric',
      criteriaJson: [
        { id: 'impact', label: 'Impact', weight: 2, minScore: 0, maxScore: 10, kind: 'int', step: 1 },
        { id: 'craft', label: 'Craft', weight: 1, minScore: 0, maxScore: 10, kind: 'int', step: 1 },
        { id: 'novelty', label: 'Novelty', weight: 1, minScore: 0, maxScore: 5, kind: 'float', step: 0.5 },
      ],
    })
    await publishEvent(admin, event.id, DEV_SEED_PASSWORD)

    for (const n of spec.organizers) {
      await assignEventRole({ actor: admin, eventId: event.id, targetUserId: ids.get(n)!, role: 'ORGANIZER' })
    }

    // Register while registration is open, then flip into the submission
    // window, finalize everything, and flip into the judging window.
    for (const n of spec.participants) {
      const user = (await findUserByEmail(email(n)))!
      await registerForEvent(user, event.id)
    }
    await db
      .update(events)
      .set({ registrationEnd: new Date(Date.now() - 10 * DAY), submissionStart: new Date(Date.now() - 9 * DAY), submissionDeadline: new Date(Date.now() + 6 * DAY) })
      .where(eq(events.id, event.id))

    let i = 0
    for (const n of spec.participants) {
      const user = (await findUserByEmail(email(n)))!
      const track = i % 2 === 0 ? trackA : trackB
      const draft = await createDraft(user, event.id, {})
      const saved = await updateDraft(user, event.id, draft.id, {
        title: `${spec.slug} project ${pad(n)}`,
        tagline: `Project ${pad(n)} tagline`,
        // No author identity in seeded content: descriptions render on the
        // judge dashboard, so an embedded email would defeat double-blind.
        description: `Sample submission ${pad(n)} for ${spec.slug}.`,
        techStack: ['TypeScript', 'Next.js'],
        trackId: track.id,
        updatedAt: draft.updatedAt,
      })
      await finalizeSubmission(user, event.id, saved.id, DEV_SEED_PASSWORD)
      i++
    }
    await db
      .update(events)
      .set({
        registrationEnd: new Date(Date.now() - 12 * DAY),
        submissionStart: new Date(Date.now() - 11 * DAY),
        submissionDeadline: new Date(Date.now() - 2 * DAY),
        judgingStart: new Date(Date.now() - 1 * DAY),
        judgingEndTime: new Date(Date.now() + 6 * DAY),
      })
      .where(eq(events.id, event.id))

    console.log(`${spec.slug}: ${spec.participants.length} submissions finalized, ${spec.organizers.length} organizers.`)
  }

  // Event-test-3 exercises the Tier-3 voting + engagement flow: single-choice
  // voting is open (PUBLIC_VOTING), ballots and comments are seeded, and two
  // submissions are near-duplicates so the plagiarism scanner has a hit.
  // Same rebuild-from-scratch guarantee as the judging events above.
  const voteParticipants = [...E1_ONLY, ...BOTH_PART]
  const voteOrganizers = [...ORG_E1, ...ORG_BOTH]
  const voteEvent = await createEvent(admin, {
    title: 'Event-test-3',
    slug: 'Event-test-3',
    participationType: 'INDIVIDUAL',
    format: 'ONLINE',
    judgesPerSubmission: 2,
    registrationEnd: iso(2 * DAY),
    submissionStart: iso(3 * DAY),
    submissionDeadline: iso(10 * DAY),
    judgingStart: iso(11 * DAY),
    judgingEndTime: iso(12 * DAY),
    publicVotingStart: iso(13 * DAY),
    publicVotingEndTime: iso(20 * DAY),
  })
  await db
    .update(events)
    .set({ votingType: 'SINGLE_CHOICE', blindVoting: false })
    .where(eq(events.id, voteEvent.id))
  const voteTrackA = await createTrack(admin, voteEvent.id, { name: 'AI' })
  const voteTrackB = await createTrack(admin, voteEvent.id, { name: 'Web' })
  await publishEvent(admin, voteEvent.id, DEV_SEED_PASSWORD)
  for (const n of voteOrganizers) {
    await assignEventRole({ actor: admin, eventId: voteEvent.id, targetUserId: ids.get(n)!, role: 'ORGANIZER' })
  }
  for (const n of voteParticipants) {
    const user = (await findUserByEmail(email(n)))!
    await registerForEvent(user, voteEvent.id)
  }
  await db
    .update(events)
    .set({ registrationEnd: new Date(Date.now() - 10 * DAY), submissionStart: new Date(Date.now() - 9 * DAY), submissionDeadline: new Date(Date.now() + 6 * DAY) })
    .where(eq(events.id, voteEvent.id))

  const voteSubIds: string[] = []
  {
    let i = 0
    for (const n of voteParticipants) {
      const user = (await findUserByEmail(email(n)))!
      const track = i % 2 === 0 ? voteTrackA : voteTrackB
      const draft = await createDraft(user, voteEvent.id, {})
      const saved = await updateDraft(user, voteEvent.id, draft.id, {
        title: `Event-test-3 project ${pad(n)}`,
        tagline: `Project ${pad(n)} tagline`,
        description: `Sample submission ${pad(n)} for Event-test-3.`,
        techStack: ['TypeScript', 'Next.js'],
        trackId: track.id,
        updatedAt: draft.updatedAt,
      })
      await finalizeSubmission(user, voteEvent.id, saved.id, DEV_SEED_PASSWORD)
      voteSubIds.push(saved.id)
      i++
    }
  }
  // Near-duplicate pair for the plagiarism scanner: identical tagline and
  // description with a one-word title difference scores ~0.95 (≥ 0.65).
  const dupDescription = 'Sample submission for Event-test-3: an AI habit tracker with streaks.'
  await db.update(submissions).set({
    title: 'Event-test-3 habit tracker',
    tagline: 'AI habit tracker',
    description: dupDescription,
  }).where(eq(submissions.id, voteSubIds[0]))
  await db.update(submissions).set({
    title: 'Event-test-3 habit tracker app',
    tagline: 'AI habit tracker',
    description: dupDescription,
  }).where(eq(submissions.id, voteSubIds[1]))
  // Move past judging into the voting window.
  await db
    .update(events)
    .set({
      registrationEnd: new Date(Date.now() - 12 * DAY),
      submissionStart: new Date(Date.now() - 11 * DAY),
      submissionDeadline: new Date(Date.now() - 4 * DAY),
      judgingStart: new Date(Date.now() - 3 * DAY),
      judgingEndTime: new Date(Date.now() - 2 * DAY),
      publicVotingStart: new Date(Date.now() - 1 * DAY),
      publicVotingEndTime: new Date(Date.now() + 6 * DAY),
    })
    .where(eq(events.id, voteEvent.id))

  // Single-choice ballots from distinct fingerprints: each voter upvotes
  // two different projects (one upvote each). A few are cast by signed-in
  // users, the rest anonymously.
  for (let k = 0; k < 12; k++) {
    const a = voteSubIds[(k * 3) % voteSubIds.length]
    const b = voteSubIds[(k * 3 + 7) % voteSubIds.length]
    const actor = k < 7 ? (await findUserByEmail(email(44 + k)))! : null
    await castVote(actor, voteEvent.id, `e3-seed-fp-${k}`, {
      allocations: [
        { submissionId: a, votes: 1 },
        { submissionId: b, votes: 1 },
      ],
    })
  }
  // Discussion threads on the first three submissions.
  const commentBodies = ['Love this idea — clean execution.', 'How does it handle offline mode?']
  for (let s = 0; s < 3; s++) {
    for (let c = 0; c < commentBodies.length; c++) {
      const author = (await findUserByEmail(email(44 + ((s + c) % 7))))!
      await postComment(author, voteSubIds[s], commentBodies[c])
    }
  }

  console.log(`Event-test-3: ${voteSubIds.length} submissions finalized, 12 ballots, 6 comments, in PUBLIC_VOTING phase.`)
  console.log('Done. Event-test-1 and Event-test-2 are in JUDGING phase; Event-test-3 is in PUBLIC_VOTING phase.')
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error('seed-judging-sample failed:', error)
    process.exit(1)
  },
)
