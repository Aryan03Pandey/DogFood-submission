import { describe, expect, it } from 'vitest'
import {
  canEditEventConfig,
  canRegister,
  phaseAllows,
  validateTrackEligibility,
} from '../../src/db/schema'
import { createEventSchema, passwordConfirmSchema, updateEventSchema } from '../../src/lib/api/schemas'

describe('phase gating', () => {
  it('allows an action only in its listed phases', () => {
    expect(phaseAllows('SUBMISSION', ['REGISTRATION', 'SUBMISSION'])).toBe(true)
    expect(phaseAllows('JUDGING', ['REGISTRATION', 'SUBMISSION'])).toBe(false)
  })

  it('restricts structural configuration to DRAFT', () => {
    expect(canEditEventConfig('DRAFT')).toBe(true)
    expect(canEditEventConfig('REGISTRATION')).toBe(false)
    expect(canEditEventConfig('PUBLISHED')).toBe(false)
  })
})

describe('self-registration', () => {
  it('allows unmapped and participant users while registering', () => {
    expect(canRegister('REGISTRATION', null)).toBe(null)
    expect(canRegister('REGISTRATION', 'PARTICIPANT')).toBe(null)
  })

  it('refuses registration outside the registration phase', () => {
    for (const status of ['DRAFT', 'SUBMISSION', 'JUDGING', 'PUBLIC_VOTING', 'PUBLISHED'] as const) {
      expect(canRegister(status, null)).toBe('EVENT_NOT_OPEN')
    }
  })

  it('leaves stronger mappings alone instead of overwriting them', () => {
    expect(canRegister('REGISTRATION', 'JUDGE')).toBe('ALREADY_REGISTERED')
    expect(canRegister('REGISTRATION', 'ORGANIZER')).toBe('ALREADY_REGISTERED')
  })
})

describe('track eligibility', () => {
  it('passes an empty ruleset for any team', () => {
    expect(validateTrackEligibility({ size: 4 }, {})).toEqual([])
    expect(validateTrackEligibility({ size: 4 }, null)).toEqual([])
  })

  it('enforces max team size', () => {
    expect(validateTrackEligibility({ size: 2 }, { max_team_size: 2 })).toEqual([])
    expect(validateTrackEligibility({ size: 3 }, { max_team_size: 2 })).toEqual(['MAX_TEAM_SIZE'])
  })

  it('enforces student-only tracks', () => {
    expect(validateTrackEligibility({ size: 2, isStudentOnly: true }, { student_only: true })).toEqual([])
    expect(validateTrackEligibility({ size: 2 }, { student_only: true })).toEqual(['STUDENT_ONLY'])
    expect(validateTrackEligibility({ size: 2 }, { student_only: false })).toEqual([])
  })

  it('enforces required tech case-insensitively', () => {
    const rules = { required_tech: ['Postgres'] }
    expect(validateTrackEligibility({ size: 1, techStack: ['postgres', 'next'] }, rules)).toEqual([])
    expect(validateTrackEligibility({ size: 1, techStack: ['sqlite'] }, rules)).toEqual(['REQUIRED_TECH'])
    expect(validateTrackEligibility({ size: 1 }, rules)).toEqual(['REQUIRED_TECH'])
  })

  it('ignores unknown and malformed rule keys', () => {
    expect(
      validateTrackEligibility({ size: 2 }, { moon_phase: 'full', max_team_size: 'huge' }),
    ).toEqual([])
  })

  it('collects every violation at once', () => {
    expect(
      validateTrackEligibility({ size: 5 }, { max_team_size: 2, student_only: true }),
    ).toEqual(['MAX_TEAM_SIZE', 'STUDENT_ONLY'])
  })
})

const schedule = {
  title: 'Dogfood 2027',
  slug: 'dogfood-2027',
  registrationEnd: '2027-02-01T00:00:00Z',
  submissionDeadline: '2027-03-01T18:00:00Z',
  judgingEndTime: '2027-03-11T18:00:00Z',
  publicVotingEndTime: '2027-03-18T18:00:00Z',
}

describe('event schedule schemas', () => {
  it('accepts a forward-running schedule', () => {
    expect(createEventSchema.safeParse(schedule).success).toBe(true)
  })

  it('rejects a deadline before its start', () => {
    const result = createEventSchema.safeParse({ ...schedule, submissionDeadline: '2027-01-01T00:00:00Z' })
    expect(result.success).toBe(false)
  })

  it('rejects bad slugs and unparseable dates', () => {
    expect(createEventSchema.safeParse({ ...schedule, slug: 'Dogfood 2027!' }).success).toBe(false)
    expect(createEventSchema.safeParse({ ...schedule, registrationEnd: 'not-a-date' }).success).toBe(false)
  })

  it('accepts a title-and-slug shell for step-by-step creation', () => {
    expect(createEventSchema.safeParse({ title: 'Dogfood 2027', slug: 'dogfood-2027' }).success).toBe(true)
  })

  it('requires a password confirmation payload for go-live and delete', () => {
    expect(passwordConfirmSchema.safeParse({ password: 'secret-123' }).success).toBe(true)
    expect(passwordConfirmSchema.safeParse({ password: '' }).success).toBe(false)
    expect(passwordConfirmSchema.safeParse({}).success).toBe(false)
  })

  it('validates partial updates pairwise', () => {
    expect(updateEventSchema.safeParse({ title: 'Renamed' }).success).toBe(true)
    expect(
      updateEventSchema.safeParse({
        submissionDeadline: '2027-03-01T18:00:00Z',
        judgingEndTime: '2027-02-01T00:00:00Z',
      }).success,
    ).toBe(false)
  })
})
