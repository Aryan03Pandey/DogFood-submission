import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toCsv } from '../../src/server/dashboard-service'
import { parseDashboardTab } from '../../components/console/dashboard/tabs'
import {
  removeEventRoleRequestSchema,
  setSubmissionHiddenSchema,
  submissionPageQuerySchema,
} from '../../src/lib/api/schemas'

const root = join(__dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('dashboard request schemas', () => {
  it('accepts the gallery hide toggle payload', () => {
    expect(setSubmissionHiddenSchema.safeParse({ isHidden: true }).success).toBe(true)
    expect(setSubmissionHiddenSchema.safeParse({ isHidden: 'yes' }).success).toBe(false)
  })

  it('accepts role removal by user id only', () => {
    expect(
      removeEventRoleRequestSchema.safeParse({ userId: '087b8851-beab-4da7-be67-d1c1c951c1c1' }).success,
    ).toBe(true)
    expect(removeEventRoleRequestSchema.safeParse({ userId: 'not-a-uuid' }).success).toBe(false)
  })

  it('parses submissions pagination, search, and filter params', () => {
    const parsed = submissionPageQuerySchema.safeParse({ page: '2', pageSize: '10', status: 'final' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.page).toBe(2)
      expect(parsed.data.pageSize).toBe(10)
      expect(parsed.data.status).toBe('final')
    }
    expect(submissionPageQuerySchema.safeParse({}).success).toBe(true)
    expect(submissionPageQuerySchema.safeParse({ page: '0' }).success).toBe(false)
    expect(submissionPageQuerySchema.safeParse({ status: 'archived' }).success).toBe(false)
  })
})

describe('dashboard tab routing', () => {
  it('defaults unknown tabs to overview', () => {
    expect(parseDashboardTab('participants')).toBe('participants')
    expect(parseDashboardTab('nope')).toBe('overview')
    expect(parseDashboardTab(undefined)).toBe('overview')
  })
})

describe('CSV exports', () => {
  it('escapes commas, quotes, and newlines per RFC 4180', () => {
    const csv = toCsv(
      ['email', 'team'],
      [
        ['a@x.org', 'Alpha, "A"\nTeam'],
        ['b@x.org', null],
      ],
    )
    expect(csv).toBe('email,team\na@x.org,"Alpha, ""A""\nTeam"\nb@x.org,\n')
  })
})

describe('dashboard API authorization', () => {
  const routes = [
    'app/api/events/[id]/dashboard/route.ts',
    'app/api/events/[id]/participants/route.ts',
    'app/api/events/[id]/participants/export/route.ts',
    'app/api/events/[id]/submissions/route.ts',
    'app/api/events/[id]/submissions/export/route.ts',
    'app/api/events/[id]/submissions/[submissionId]/route.ts',
    'app/api/events/[id]/gallery-items/route.ts',
    'app/api/events/[id]/publish/route.ts',
  ]

  for (const route of routes) {
    it(`${route} enforces the organizer check`, () => {
      expect(read(route)).toMatch(/assertEventOrganizer|requireSession/)
    })
  }

  it('delete event and role removal enforce organizer checks', () => {
    expect(read('app/api/events/[id]/route.ts')).toMatch(/deleteEvent/)
    expect(read('app/api/events/[id]/roles/route.ts')).toMatch(/removeEventRole/)
    expect(read('src/server/dashboard-service.ts')).toMatch(/assertEventOrganizer/)
  })

  it('nobody can remove their own event mapping', () => {
    expect(read('src/server/dashboard-service.ts')).toMatch(/CANNOT_REMOVE_SELF/)
  })
})

describe('dashboard UI contract', () => {
  it('lives at /console with the dock shell; the old event route redirects', () => {
    const page = read('app/console/page.tsx')
    expect(page).not.toMatch(/console\/event-tabs/)
    expect(page).toMatch(/TopDock/)
    expect(page).toMatch(/SideDock/)
    expect(page).toMatch(/eventId/)
    const legacy = read('app/console/events/[id]/page.tsx')
    expect(legacy).toMatch(/redirect/)
    expect(legacy).toMatch(/\/console\?eventId=/)
  })

  it('judging tab is fully built and full export is enabled (IMPROVEMENTS.md item 11)', () => {
    const panel = read('components/console/dashboard/judging-panel.tsx')
    expect(panel).toMatch(/JudgesManager/)
    expect(panel).toMatch(/RubricBuilder/)
    expect(panel).toMatch(/AlgorithmsForm/)
    expect(panel).toMatch(/AssignmentsPanel/)
    expect(panel).not.toMatch(/not set up yet/i)
    const settings = read('components/console/dashboard/settings-panel.tsx')
    expect(settings).toMatch(/\/api\/events\/\$\{event\.id\}\/export/)
    expect(settings).not.toMatch(/coming soon/i)
  })

  it('shortlist route exists as an empty state, not a dead end', () => {
    const shortlist = read('app/console/events/[id]/shortlist/page.tsx')
    expect(shortlist).toMatch(/No shortlist yet/)
    expect(shortlist).toMatch(/Back to participants/)
  })

  it('event switcher preserves the tab and shows stage plus draft state', () => {
    const switcher = read('components/console/dashboard/event-switcher.tsx')
    expect(switcher).toMatch(/\/console\?eventId=/)
    expect(switcher).toMatch(/tab=\$\{currentTab\}/)
    expect(switcher).toMatch(/Public/)
    expect(switcher).toMatch(/Draft/)
  })

  it('top dock sticks under the navbar with a centered event selector only', () => {
    const top = read('components/console/dashboard/top-dock.tsx')
    expect(top).toMatch(/sticky top-16/)
    expect(top).toMatch(/justify-center/)
    expect(top).toMatch(/max-w-md/)
    expect(top).not.toMatch(/tab\.label/)
    expect(top).not.toMatch(/events\.length/)
  })

  it('the left dock is fixed and sticky with no system health card', () => {
    const dock = read('components/console/dashboard/side-dock.tsx')
    expect(dock).toMatch(/sticky/)
    expect(dock).not.toMatch(/dashboard-dock-collapsed/)
    expect(dock).not.toMatch(/Collapse dashboard navigation/)
    expect(dock).toMatch(/aria-label=\{tab\.label\}/)
    expect(dock).toMatch(/min-h-\[calc\(100vh-4rem-60px\)\]/)
    expect(dock).not.toMatch(/System health/)
  })

  it('overview drops the new-event button, the table filter, and the help footer', () => {
    const overview = read('components/console/dashboard/overview-panel.tsx')
    expect(overview).not.toMatch(/New event/)
    expect(overview).not.toMatch(/Timeline options/)
    expect(overview).not.toMatch(/help center/i)
    // Tier-3 redesign replaced the recent-submissions list with stat cards.
    expect(overview).toMatch(/Community votes/)
  })

  it('submissions are paginated with search and filters end to end', () => {
    expect(read('app/api/events/[id]/submissions/route.ts')).toMatch(/submissionPageQuerySchema/)
    expect(read('app/api/events/[id]/submissions/route.ts')).toMatch(/listDashboardSubmissionsPage/)
    expect(read('src/server/dashboard-service.ts')).toMatch(/listDashboardSubmissionsPage/)
    const panel = read('components/console/dashboard/submissions-panel.tsx')
    expect(panel).toMatch(/Previous page/)
    expect(panel).toMatch(/Next page/)
    expect(panel).toMatch(/Filter by status/)
    expect(panel).toMatch(/Filter by track/)
    expect(panel).toMatch(/Search submissions/)
    expect(panel).toMatch(/apiListDashboardSubmissions/)
    expect(read('app/console/page.tsx')).toMatch(/listDashboardSubmissionsPage/)
  })

  it('overview draft banner and phase progress render from event dates', () => {
    // Tier-3 redesign replaced the client-side greeting with a draft banner
    // and a date-driven phase timeline.
    const overview = read('components/console/dashboard/overview-panel.tsx')
    expect(overview).toMatch(/draft mode/)
    expect(overview).toMatch(/phaseProgress/)
    expect(overview).toMatch(/Quick actions/)
  })

  it('dashboard dates pin UTC so server and browser render the same day', () => {
    for (const file of [
      'components/console/dashboard/overview-panel.tsx',
      'components/console/dashboard/submissions-panel.tsx',
      'components/console/dashboard/participants-panel.tsx',
      'components/console/event-wizard.tsx',
    ]) {
      expect(read(file)).toMatch(/timeZone:\s*['"]UTC['"]/)
    }
  })

  it('dashboard chrome uses theme tokens with green as the only accent', () => {
    for (const file of [
      'app/console/page.tsx',
      'components/console/dashboard/side-dock.tsx',
      'components/console/dashboard/top-dock.tsx',
      'components/console/dashboard/overview-panel.tsx',
      'components/console/dashboard/submissions-panel.tsx',
    ]) {
      const body = read(file)
      expect(body).not.toMatch(/#635bdb/)
      expect(body).not.toMatch(/#f7f8fb/)
      expect(body).not.toMatch(/#20222b/)
    }
  })

  it('go-live and delete need the actor password', () => {
    const control = read('components/console/dashboard/go-live-control.tsx')
    expect(control).toMatch(/type="password"/)
    expect(control).toMatch(/apiPublishEvent\(eventId, password\)/)
    expect(control).toMatch(/SCHEDULE_INCOMPLETE/)
    const settings = read('components/console/dashboard/settings-panel.tsx')
    expect(settings).toMatch(/GoLiveControl/)
    expect(settings).toMatch(/apiDeleteEvent\(event\.id, deletePassword\)/)
    expect(settings).toMatch(/Confirm with your password/)
    expect(read('app/api/events/[id]/publish/route.ts')).toMatch(/passwordConfirmSchema/)
    expect(read('app/api/events/[id]/route.ts')).toMatch(/passwordConfirmSchema/)
  })

  it('preview shows full details with a go-live button', () => {
    const preview = read('components/console/event-preview.tsx')
    expect(preview).toMatch(/EventTabs/)
    expect(preview).toMatch(/data\.tracks/)
    expect(preview).toMatch(/data\.tiers/)
    const page = read('app/console/events/[id]/preview/page.tsx')
    expect(page).toMatch(/GoLiveControl/)
  })

  it('settings links to the edit-event page and offers organizer, judge, and admin', () => {
    const settings = read('components/console/dashboard/settings-panel.tsx')
    expect(settings).toMatch(/aria-label="Edit event"/)
    expect(settings).not.toMatch(/EventForm/)
    expect(settings).toMatch(/ORGANIZER/)
    expect(settings).toMatch(/JUDGE/)
    expect(settings).toMatch(/ADMIN/)
    expect(settings).toMatch(/apiSetGlobalRole/)
  })
})
