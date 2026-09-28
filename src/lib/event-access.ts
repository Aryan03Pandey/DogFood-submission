import type { EventStatus } from '../db/schema'

// Viewer relationship to one event. `participant` holds a PARTICIPANT
// mapping; `staff` is an organizer, judge, or superadmin; `unmapped` is
// signed in with no mapping for this event.
export type EventMembership = 'anonymous' | 'unmapped' | 'participant' | 'staff'

export interface EventTeamSummary {
  size: number
  min: number
  max: number
}

export interface EventActionInput {
  status: EventStatus
  membership: EventMembership
  now: Date | string
  submissionStart: string | null
  registrationEnd: string | null
  registrationCount: number
  participation?: 'INDIVIDUAL' | 'TEAM'
  // Null = registered but teamless (TEAM events). Absent = unknown / not a
  // team context.
  team?: EventTeamSummary | null
}

export interface EventActionState {
  buttonLabel: string
  buttonEnabled: boolean
  // Slug-based destination for Manage Team / Make Submission. Null for the
  // Register button (it POSTs instead), for the team choice popup, and for
  // every disabled state.
  buttonHref: string | null
  // Teamless registered users pick Create vs Join in a popup, not a link.
  opensChoice?: boolean
  tone?: 'green' | 'red'
  headline: string | null
  showDeadline: boolean
  showCount: boolean
}

// The public event page action area: one button plus supporting copy,
// derived from the effective phase and the viewer's membership. Pure so the
// matrix is unit-testable and reusable wherever event actions render.
export function getEventActionState(input: EventActionInput): EventActionState {
  const now = new Date(input.now).getTime()
  const submissionOpen =
    input.submissionStart == null || now >= new Date(input.submissionStart).getTime()

  if (input.status === 'REGISTRATION') {
    if (input.membership === 'participant') {
      if (input.participation === 'INDIVIDUAL') {
        return {
          buttonLabel: 'Registered, Check Status',
          buttonEnabled: true,
          buttonHref: 'team',
          headline: "Congratulations! You're registered",
          showDeadline: true,
          showCount: true,
        }
      }
      if (input.team) {
        const complete = input.team.size >= input.team.min && input.team.size <= input.team.max
        return {
          buttonLabel: complete ? 'Team Complete, Check Status' : 'Team Incomplete, Check Status',
          buttonEnabled: true,
          buttonHref: 'team',
          tone: complete ? 'green' : 'red',
          headline: "Congratulations! You're registered",
          showDeadline: true,
          showCount: true,
        }
      }
      return {
        buttonLabel: 'Manage Team',
        buttonEnabled: true,
        buttonHref: null,
        opensChoice: true,
        headline: "Congratulations! You're registered",
        showDeadline: true,
        showCount: true,
      }
    }
    if (input.membership === 'staff') {
      return {
        buttonLabel: 'Register',
        buttonEnabled: false,
        buttonHref: null,
        headline: "You're on the event team — registration is for hackers.",
        showDeadline: true,
        showCount: true,
      }
    }
    // TEAM events choose first, register second: the popup's Create/Join
    // buttons register the viewer and then navigate onward, so closing the
    // popup cancels the whole action without registering anyone.
    if (input.participation === 'TEAM') {
      return {
        buttonLabel: 'Register',
        buttonEnabled: true,
        buttonHref: null,
        opensChoice: true,
        headline: null,
        showDeadline: true,
        showCount: true,
      }
    }
    return {
      buttonLabel: 'Register',
      buttonEnabled: true,
      buttonHref: null,
      headline: null,
      showDeadline: true,
      showCount: true,
    }
  }

  // Registration ended but submissions have not started yet.
  if (!submissionOpen) {
    return {
      buttonLabel: 'Register',
      buttonEnabled: false,
      buttonHref: null,
      headline:
        input.membership === 'staff'
          ? "You're on the event team — registration is for hackers."
          : 'Registration Closed',
      showDeadline: false,
      showCount: true,
    }
  }

  // Submission window is open.
  if (input.status === 'SUBMISSION') {
    if (input.membership === 'participant') {
      return {
        buttonLabel: 'Make Submission',
        buttonEnabled: true,
        buttonHref: 'submit',
        headline: null,
        showDeadline: false,
        showCount: true,
      }
    }
    return {
      buttonLabel: 'Register',
      buttonEnabled: false,
      buttonHref: null,
      headline:
        input.membership === 'staff'
          ? "You're on the event team — registration is for hackers."
          : 'Registration is closed',
      showDeadline: false,
      showCount: true,
    }
  }

  // Submission end onwards (judging, voting, published — and defensively
  // anything else, including DRAFT which the page never shows).
  if (input.membership === 'participant') {
    return {
      buttonLabel: 'Submissions closed',
      buttonEnabled: false,
      buttonHref: null,
      headline: 'Kindly wait for results',
      showDeadline: false,
      showCount: true,
    }
  }
  return {
    buttonLabel: 'Register',
    buttonEnabled: false,
    buttonHref: null,
    headline:
      input.membership === 'staff'
        ? "You're on the event team — registration is for hackers."
        : 'Registration is closed',
    showDeadline: false,
    showCount: true,
  }
}

// Resolves the relative buttonHref against the public event path.
export function withEventSlug(state: EventActionState, slug: string): EventActionState {
  if (!state.buttonHref) return state
  return { ...state, buttonHref: `/hackathons/${slug}/${state.buttonHref}` }
}
