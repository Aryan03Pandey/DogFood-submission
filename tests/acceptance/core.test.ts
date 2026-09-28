import { describe, expect, it } from 'vitest'
import { canChangePrize, deriveEventStatus, resolveConstraints, trimmedMean, validateTeamSize, validateUrl } from '../../src/db/schema'

describe('Dogfood 2026 core acceptance', () => {
  it('enforces prize integrity', () => { expect(canChangePrize('SUBMISSION', 1000, 999)).toBe(false) })
  it('derives submission phase from server time', () => { const now = new Date('2026-05-20'); expect(deriveEventStatus({ status: 'REGISTRATION', submissionStart: new Date('2026-05-19'), submissionDeadline: new Date('2026-05-21'), judgingEndTime: new Date('2026-05-22'), publicVotingEndTime: new Date('2026-05-23') }, now)).toBe('SUBMISSION') })
  it('validates secure project URLs and normalized scores', () => { expect(validateUrl('https://github.com/dogfood/app')).toBe(true); expect(trimmedMean([1, 2, 3, 4, 100])).toBe(3) })
})

describe('explicit per-phase boundaries', () => {
  const base = { status: 'REGISTRATION' as const, submissionStart: new Date('2026-05-19'), submissionDeadline: new Date('2026-05-21'), judgingEndTime: new Date('2026-05-22'), publicVotingEndTime: new Date('2026-05-23') }
  it('honors an explicit registration end earlier than submission start', () => {
    expect(deriveEventStatus({ ...base, registrationEnd: new Date('2026-05-18') }, new Date('2026-05-18T12:00:00'))).toBe('SUBMISSION')
    expect(deriveEventStatus({ ...base, registrationEnd: new Date('2026-05-18') }, new Date('2026-05-17'))).toBe('REGISTRATION')
  })
  it('extends judging until an explicit public voting start', () => {
    expect(deriveEventStatus({ ...base, publicVotingStart: new Date('2026-05-24') }, new Date('2026-05-23T12:00:00'))).toBe('JUDGING')
  })
  it('starts at submission when registration end is absent', () => {
    expect(deriveEventStatus(base, new Date('2026-05-18'))).toBe('SUBMISSION')
    expect(deriveEventStatus(base, new Date('2026-05-21T12:00:00'))).toBe('JUDGING')
    expect(deriveEventStatus(base, new Date('2026-05-24'))).toBe('PUBLISHED')
  })
})

describe('team size constraints', () => {
  it('defaults to the 1..4 product rule', () => {
    expect(resolveConstraints({})).toMatchObject({ minTeamSize: 1, maxTeamSize: 4 })
    expect(validateTeamSize(1)).toBe(true)
    expect(validateTeamSize(4)).toBe(true)
    expect(validateTeamSize(5)).toBe(false)
  })
  it('accepts valid env overrides and rejects garbage without inverting', () => {
    expect(resolveConstraints({ TEAM_MIN_SIZE: '2', TEAM_MAX_SIZE: '6' })).toMatchObject({ minTeamSize: 2, maxTeamSize: 6 })
    expect(resolveConstraints({ TEAM_MIN_SIZE: 'huge', TEAM_MAX_SIZE: '-3' })).toMatchObject({ minTeamSize: 1, maxTeamSize: 4 })
    expect(resolveConstraints({ TEAM_MIN_SIZE: '5', TEAM_MAX_SIZE: '2' }).maxTeamSize).toBe(5)
  })
})
