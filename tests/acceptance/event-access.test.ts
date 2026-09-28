import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  getEventActionState,
  withEventSlug,
  type EventActionInput,
} from '../../src/lib/event-access'

const root = join(__dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

function input(overrides: Partial<EventActionInput> = {}): EventActionInput {
  return {
    status: 'REGISTRATION',
    membership: 'anonymous',
    now: new Date('2026-05-10T12:00:00Z'),
    submissionStart: new Date('2026-05-20T00:00:00Z').toISOString(),
    registrationEnd: new Date('2026-05-15T00:00:00Z').toISOString(),
    registrationCount: 42,
    ...overrides,
  }
}

describe('event action states', () => {
  it('offers Register with deadline and count during registration', () => {
    const state = getEventActionState(input())
    expect(state).toMatchObject({
      buttonLabel: 'Register',
      buttonEnabled: true,
      buttonHref: null,
      headline: null,
      showDeadline: true,
      showCount: true,
    })
  })

  it('opens the team choice before registering for team events', () => {
    for (const membership of ['anonymous', 'unmapped'] as const) {
      const state = getEventActionState(input({ membership, participation: 'TEAM' }))
      expect(state).toMatchObject({
        buttonLabel: 'Register',
        buttonEnabled: true,
        buttonHref: null,
        headline: null,
      })
      expect(state.opensChoice).toBe(true)
    }
  })

  it('registers directly for individual events with no popup', () => {
    for (const membership of ['anonymous', 'unmapped'] as const) {
      const state = getEventActionState(input({ membership, participation: 'INDIVIDUAL' }))
      expect(state).toMatchObject({
        buttonLabel: 'Register',
        buttonEnabled: true,
        buttonHref: null,
      })
      expect(state.opensChoice).toBeUndefined()
    }
  })

  it('opens the team choice for teamless participants', () => {
    const state = getEventActionState(
      input({ membership: 'participant', participation: 'TEAM', team: null }),
    )
    expect(state).toMatchObject({
      buttonLabel: 'Manage Team',
      buttonEnabled: true,
      buttonHref: null,
      headline: "Congratulations! You're registered",
    })
    expect(state.opensChoice).toBe(true)
  })

  it('marks complete and incomplete teams with green and red states', () => {
    const complete = getEventActionState(
      input({
        membership: 'participant',
        participation: 'TEAM',
        team: { size: 3, min: 2, max: 4 },
      }),
    )
    expect(complete).toMatchObject({
      buttonLabel: 'Team Complete, Check Status',
      buttonEnabled: true,
      tone: 'green',
    })
    expect(withEventSlug(complete, 'dogfood-2026').buttonHref).toBe(
      '/hackathons/dogfood-2026/team',
    )
    const incomplete = getEventActionState(
      input({
        membership: 'participant',
        participation: 'TEAM',
        team: { size: 1, min: 2, max: 4 },
      }),
    )
    expect(incomplete).toMatchObject({
      buttonLabel: 'Team Incomplete, Check Status',
      buttonEnabled: true,
      tone: 'red',
    })
  })

  it('shows Registered, Check Status for individual participants', () => {
    const state = getEventActionState(
      input({ membership: 'participant', participation: 'INDIVIDUAL' }),
    )
    expect(state).toMatchObject({
      buttonLabel: 'Registered, Check Status',
      buttonEnabled: true,
    })
    expect(withEventSlug(state, 'dogfood-2026').buttonHref).toBe(
      '/hackathons/dogfood-2026/team',
    )
  })

  it('keeps event staff out of registration with an honest note', () => {
    const state = getEventActionState(input({ membership: 'staff' }))
    expect(state.buttonEnabled).toBe(false)
    expect(state.headline).toMatch(/event team/)
  })

  it('closes registration for everyone once registration ends', () => {
    for (const membership of ['anonymous', 'unmapped', 'participant', 'staff'] as const) {
      const state = getEventActionState(
        input({ status: 'SUBMISSION', membership, now: new Date('2026-05-17T12:00:00Z') }),
      )
      expect(state.buttonEnabled).toBe(false)
      if (membership !== 'staff') {
        expect(state.headline).toBe('Registration Closed')
      }
    }
  })

  it('offers Make Submission to participants while submissions are open', () => {
    const state = getEventActionState(
      input({ status: 'SUBMISSION', membership: 'participant', now: new Date('2026-05-22T12:00:00Z') }),
    )
    expect(state).toMatchObject({ buttonLabel: 'Make Submission', buttonEnabled: true })
    expect(withEventSlug(state, 'dogfood-2026').buttonHref).toBe(
      '/hackathons/dogfood-2026/submit',
    )
  })

  it('locks non-registered users out with a disabled Register while open', () => {
    const state = getEventActionState(
      input({ status: 'SUBMISSION', membership: 'unmapped', now: new Date('2026-05-22T12:00:00Z') }),
    )
    expect(state).toMatchObject({ buttonLabel: 'Register', buttonEnabled: false })
    expect(state.headline).not.toBe(null)
  })

  it('asks participants to wait once submissions close', () => {
    for (const status of ['JUDGING', 'PUBLIC_VOTING', 'PUBLISHED'] as const) {
      const state = getEventActionState(
        input({ status, membership: 'participant', now: new Date('2026-06-01T12:00:00Z') }),
      )
      expect(state).toMatchObject({
        buttonLabel: 'Submissions closed',
        buttonEnabled: false,
        headline: 'Kindly wait for results',
      })
    }
  })

  it('shows a disabled Register to outsiders after submissions close', () => {
    const state = getEventActionState(
      input({ status: 'JUDGING', membership: 'anonymous', now: new Date('2026-06-01T12:00:00Z') }),
    )
    expect(state).toMatchObject({ buttonLabel: 'Register', buttonEnabled: false })
    expect(state.showCount).toBe(true)
  })
})

describe('registration profile gate', () => {
  it('refuses registration with an incomplete profile at the service level', () => {
    const service = read('src/server/event-service.ts')
    expect(service).toMatch(/hasCompleteProfile\(actor\)/)
    expect(service).toMatch(/PROFILE_INCOMPLETE/)
  })

  it('links incomplete users to their profile from the action area', () => {
    const action = read('components/event-page/event-action.tsx')
    expect(action).toMatch(/PROFILE_INCOMPLETE/)
    expect(action).toMatch(/href="\/profile"/)
    expect(action).toMatch(/Complete your profile/)
  })
})

describe('public event page contract', () => {
  it('renders header, action, and tabs from the slug route', () => {
    const page = read('app/hackathons/[slug]/page.tsx')
    expect(page).toMatch(/getEventBySlug/)
    expect(page).toMatch(/countEventRegistrations/)
    expect(page).toMatch(/getEventActionState/)
    expect(page).toMatch(/notFound\(\)/)
    expect(page).toMatch(/EventAction/)
    expect(page).toMatch(/EventTabs/)
  })

  it('shows the tracks tab only when the event has tracks', () => {
    const tabs = read('components/event-page/event-tabs.tsx')
    expect(tabs).toMatch(/tracks\.length > 0/)
    expect(tabs).toMatch(/Description/)
    expect(tabs).toMatch(/Timeline/)
    expect(tabs).toMatch(/Prizes/)
  })

  it('team and submit destinations exist as empty states, not dead ends', () => {
    for (const route of ['team', 'submit']) {
      const page = read(`app/hackathons/[slug]/${route}/page.tsx`)
      expect(page).toMatch(/Back to event/)
      expect(page).toMatch(/\/hackathons\/\$\{slug\}/)
    }
  })
})
