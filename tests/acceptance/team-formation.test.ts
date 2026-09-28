import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  formatInviteToken,
  isInviteExpired,
  isRosterFrozen,
  normalizeInviteToken,
} from '../../src/lib/teams'
import {
  createTeamSchema,
  joinTeamSchema,
  renameTeamSchema,
  teamMemberSchema,
} from '../../src/lib/api/schemas'

const root = join(__dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('invite tokens', () => {
  it('normalizes pasted and linked forms to one canonical shape', () => {
    expect(normalizeInviteToken('DF-8X2F-3J9Q')).toBe('DF8X2F3J9Q')
    expect(normalizeInviteToken('df 8x2f 3j9q')).toBe('DF8X2F3J9Q')
    expect(normalizeInviteToken('  df-8x2f-3j9q\n')).toBe('DF8X2F3J9Q')
    expect(normalizeInviteToken('')).toBe('')
  })

  it('formats the canonical form for air-gapped copying', () => {
    expect(formatInviteToken('DF8X2F3J9Q')).toBe('DF-8X2F-3J9Q')
    expect(normalizeInviteToken(formatInviteToken('DF8X2F3J9Q'))).toBe('DF8X2F3J9Q')
  })

  it('treats missing expiries as never-expiring and past ones as expired', () => {
    expect(isInviteExpired(null, new Date('2026-05-10T00:00:00Z'))).toBe(false)
    expect(
      isInviteExpired(new Date('2026-05-09T00:00:00Z'), new Date('2026-05-10T00:00:00Z')),
    ).toBe(true)
    expect(
      isInviteExpired(new Date('2026-05-11T00:00:00Z'), new Date('2026-05-10T00:00:00Z')),
    ).toBe(false)
  })
})

describe('roster freeze', () => {
  it('freezes on submission lock regardless of dates', () => {
    expect(
      isRosterFrozen({ isLocked: true, registrationEnd: new Date('2027-05-01T00:00:00Z') }),
    ).toBe(true)
  })

  it('freezes once global registration closes', () => {
    expect(
      isRosterFrozen(
        { isLocked: false, registrationEnd: new Date('2026-05-01T00:00:00Z') },
        new Date('2026-05-10T00:00:00Z'),
      ),
    ).toBe(true)
    expect(
      isRosterFrozen(
        { isLocked: false, registrationEnd: new Date('2026-06-01T00:00:00Z') },
        new Date('2026-05-10T00:00:00Z'),
      ),
    ).toBe(false)
  })

  it('stays open when registration end is unscheduled', () => {
    expect(isRosterFrozen({ isLocked: false, registrationEnd: null })).toBe(false)
  })
})

describe('team request schemas', () => {
  it('names teams within bounds', () => {
    expect(createTeamSchema.safeParse({ name: 'Glass Signal' }).success).toBe(true)
    expect(createTeamSchema.safeParse({ name: '  ' }).success).toBe(false)
    expect(renameTeamSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false)
  })

  it('requires a token to join and a uuid to address members', () => {
    expect(joinTeamSchema.safeParse({ token: 'DF-8X2F-3J9Q' }).success).toBe(true)
    expect(joinTeamSchema.safeParse({ token: '' }).success).toBe(false)
    expect(
      teamMemberSchema.safeParse({ userId: '087b8851-beab-4da7-be67-d1c1c951c1c1' }).success,
    ).toBe(true)
    expect(teamMemberSchema.safeParse({ userId: 'nope' }).success).toBe(false)
  })
})

describe('team surface contract', () => {
  it('exposes create, read, rename, delete, token, join, leave, kick, and transfer routes', () => {
    expect(read('app/api/events/[id]/teams/route.ts')).toMatch(/createTeam/)
    expect(read('app/api/events/[id]/teams/route.ts')).toMatch(/getMyTeam/)
    expect(read('app/api/events/[id]/teams/[teamId]/route.ts')).toMatch(/passwordConfirmSchema/)
    expect(read('app/api/events/[id]/teams/[teamId]/token/route.ts')).toMatch(/rotateInviteToken/)
    expect(read('app/api/events/[id]/teams/join/route.ts')).toMatch(/joinTeamByToken/)
    expect(read('app/api/events/[id]/teams/[teamId]/leave/route.ts')).toMatch(/leaveTeam/)
    expect(read('app/api/events/[id]/teams/[teamId]/kick/route.ts')).toMatch(/kickMember/)
    expect(read('app/api/events/[id]/teams/[teamId]/transfer/route.ts')).toMatch(/transferLeadership/)
    expect(read('app/api/events/[id]/submissions/[submissionId]/submit/route.ts')).toMatch(
      /finalizeSubmission/,
    )
  })

  it('exposes a password-confirmed team submit route', () => {
    expect(read('app/api/events/[id]/teams/[teamId]/submit/route.ts')).toMatch(/submitTeam/)
    expect(read('app/api/events/[id]/teams/[teamId]/submit/route.ts')).toMatch(/passwordConfirmSchema/)
  })

  it('finalizes complete rosters irreversibly and rejects the rest', () => {
    const service = read('src/server/team-service.ts')
    expect(service).toMatch(/submitTeam/)
    expect(service).toMatch(/TEAM_INCOMPLETE/)
    expect(service).toMatch(/ALREADY_SUBMITTED/)
  })

  it('reserves submit and delete for the leader', () => {
    const service = read('src/server/team-service.ts')
    expect(service).toMatch(/export async function submitTeam\([\s\S]*?role !== 'LEADER'/)
    expect(service).toMatch(/membership\.role !== 'LEADER'/)
    const manage = read('components/team/manage-team.tsx')
    expect(manage).toMatch(/!submitted &&[\s\S]*?isLeader &&/)
  })

  it('cancels by unregistering every member, even when submitted', () => {
    const service = read('src/server/team-service.ts')
    expect(service).toMatch(/unregisters every member/)
    expect(service).toMatch(/delete\(eventRoles\)/)
  })

  it('locks the roster on submit and guards every mutation', () => {
    const service = read('src/server/team-service.ts')
    expect(service).toMatch(/TEAM_LOCKED/)
    expect(service).toMatch(/INVITE_EXPIRED/)
    expect(service).toMatch(/TEAM_FULL/)
    expect(service).toMatch(/INVITE_INVALID/)
    expect(service).toMatch(/RATE_LIMITED/)
    expect(service).toMatch(/partial unique index/)
    expect(service).toMatch(/longest-tenured/)
  })

  it('shows expiry only to the leader with a rotation call to action', () => {
    const manage = read('components/team/manage-team.tsx')
    expect(manage).toMatch(/Your invite code has expired/)
    expect(manage).toMatch(/Generate new invite code/)
    expect(manage).toMatch(/isLeader &&/)
    expect(manage).toMatch(/Team complete/)
    expect(manage).toMatch(/Team incomplete/)
    expect(manage).toMatch(/Make captain/)
    expect(manage).toMatch(/Submit Team/)
    expect(manage).toMatch(/Cancel Team/)
  })

  it('offers the create-vs-join popup from the event action', () => {
    const action = read('components/event-page/event-action.tsx')
    expect(action).toMatch(/Create a Team/)
    expect(action).toMatch(/Join a Team/)
    expect(action).toMatch(/team\?mode=/)
    expect(action).toMatch(/choose\('create'\)/)
    expect(action).toMatch(/choose\('join'\)/)
  })

  it('registers only after the popup choice, never before it', () => {
    const action = read('components/event-page/event-action.tsx')
    expect(action).toMatch(/choice comes before registration/)
    expect(action).toMatch(/apiRegisterForEvent\(eventId\)/)
  })

  it('confirms submit with a password and locks submitted teams read-only', () => {
    const manage = read('components/team/manage-team.tsx')
    expect(manage).toMatch(/not reversible/)
    expect(manage).toMatch(/Confirm submit/)
    expect(manage).toMatch(/apiSubmitTeam/)
    expect(manage).toMatch(/Team locked and submitted/)
    expect(manage).toMatch(/isLeader && !submitted/)
    expect(manage).toMatch(/unregisters every member/)
  })

  it('resolves invite links to their event and team', () => {
    expect(read('app/invite/page.tsx')).toMatch(/resolveInviteToken/)
    expect(read('app/invite/page.tsx')).toMatch(/token/)
  })
})
