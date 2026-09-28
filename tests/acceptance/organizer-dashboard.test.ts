import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { slugifyTitle, validatePrizes } from '../../src/lib/event-creation'
import { sanitizeDescriptionHtml } from '../../src/lib/sanitize'

const root = join(__dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('wizard + dashboard fixes (IMPROVEMENTS.md items 12-21)', () => {
  it('removes the Analytics placeholder from the console dock (item 12)', () => {
    const dock = read('components/console/dashboard/side-dock.tsx')
    expect(dock).not.toMatch(/Analytics/)
  })

  it('guides to basics without pre-showing errors (item 13)', () => {
    const wizard = read('components/console/event-wizard.tsx')
    // Shell creation jumps to basics with a clean slate; errors surface on
    // the next explicit save/continue from that step.
    expect(wizard).toMatch(/Guide, don't scold/)
  })

  it('derives slugs from titles (item 14)', () => {
    expect(slugifyTitle('Dogfood 2027!')).toBe('dogfood-2027')
    expect(slugifyTitle('  AI & Robotics  ')).toBe('ai-robotics')
    expect(slugifyTitle('')).toBe('')
    const step = read('components/console/wizard-steps/basics-step.tsx')
    expect(step).toMatch(/slugifyTitle\(data\.title\)/)
    expect(step).toMatch(/Filled in from the title/)
  })

  it('disables past dates in the event date picker (item 15)', () => {
    const field = read('components/console/date-time-field.tsx')
    expect(field).toMatch(/disabled=\{\{ before: startOfDay\(new Date\(\)\) \}\}/)
  })

  it('allows events with zero prize tiers (item 16)', () => {
    expect(validatePrizes({ tiers: [], participationCertificate: false, acknowledged: true })).toEqual([])
    const step = read('src/lib/event-creation.ts')
    expect(step).not.toMatch(/Add at least one prize tier/)
  })

  it('routes Review & publish and stat cards to real tabs (items 17, 20)', () => {
    const panel = read('components/console/dashboard/overview-panel.tsx')
    expect(panel).toMatch(/router\.push\(`\/console\?eventId=\$\{event\.id\}&tab=\$\{tab\}`\)/)
    expect(panel).toMatch(/tab: 'judging' as DashboardTab/)
    expect(panel).not.toMatch(/tab: 'judges'/)
    expect(panel).toMatch(/Live now/)
    expect(panel).toMatch(/Closed/)
  })

  it('surfaces Edit event at the top and in Settings (items 18, 19)', () => {
    const consolePage = read('app/console/page.tsx')
    expect(consolePage).toMatch(/\/console\/events\/\$\{event\.id\}\/edit/)
    const settings = read('components/console/dashboard/settings-panel.tsx')
    expect(settings).toMatch(/aria-label="Edit event"/)
  })

  it('exports the full event as one multi-section CSV via the batched streamer (item 11)', () => {
    const service = read('src/server/dashboard-service.ts')
    expect(service).toMatch(/export async function getEventExportTables/)
    expect(service).toMatch(/assertEventOrganizer\(actor, eventId\)/)
    const route = read('app/api/events/[id]/export/route.ts')
    expect(route).toMatch(/streamCsvRows\(session\.user, eventId\)/)
    for (const section of ['participants', 'teams', 'submissions', 'judging', 'voting']) {
      expect(route).toContain(section)
    }
    expect(route).toMatch(/attachment; filename=/)
    const panel = read('components/console/dashboard/settings-panel.tsx')
    expect(panel).toMatch(/\/api\/events\/\$\{event\.id\}\/export/)
    expect(panel).not.toMatch(/coming soon/i)
  })

  it('keeps website and description links clickable on the event page (item 21)', () => {
    const page = read('app/hackathons/[slug]/page.tsx')
    expect(page).toMatch(/href=\{event\.websiteUrl\}/)
    expect(sanitizeDescriptionHtml('<p>See <a href="https://example.org">us</a></p>')).toContain(
      '<a href="https://example.org"',
    )
  })
})
