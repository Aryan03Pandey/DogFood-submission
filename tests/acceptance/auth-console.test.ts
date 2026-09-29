import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('auth + console authorization (IMPROVEMENTS.md items 9-10)', () => {
  it('styles login and signup with site tokens and the green accent (item 9)', () => {
    for (const file of ['components/auth/login-form.tsx', 'components/auth/signup-form.tsx']) {
      const form = read(file)
      expect(form).toMatch(/bg-background/)
      expect(form).toMatch(/bg-card/)
      expect(form).toMatch(/bg-\[#16a34a\]/)
      expect(form).not.toMatch(/#635bdb/)
      expect(form).not.toMatch(/#f7f8fb/)
    }
  })

  it('refuses to lift event participants onto the organizers team (item 10a)', () => {
    const service = read('src/server/auth-service.ts')
    expect(service).toMatch(/input\.role === 'ORGANIZER' && existing\?\.role === 'PARTICIPANT'/)
  })

  it('scopes the console switcher to managed events, API stays guarded (item 10b)', () => {
    const service = read('src/server/event-service.ts')
    expect(service).toMatch(/export async function listManagedEvents/)
    const page = read('app/console/page.tsx')
    expect(page).toMatch(/listManagedEvents\(session\.user\)/)
    expect(page).not.toMatch(/listEvents\(session\.user\)/)
  })

  it('scopes the console My Events list to managed events (item 10b)', () => {
    const page = read('app/console/events/page.tsx')
    expect(page).toMatch(/listManagedEvents\(session\.user\)/)
    expect(page).not.toMatch(/listEvents\(session\.user\)/)
  })

  it('denies the whole console to non-organizers on every page, URL included', () => {
    const service = read('src/server/event-service.ts')
    expect(service).toMatch(/export async function managesAnyEvent/)
    expect(service).toMatch(/user\.role === ['"]SUPERADMIN['"]/)
    expect(service).toMatch(/row\.role === ['"]ORGANIZER['"]/)
    expect(read('src/server/auth-service.ts')).not.toMatch(/hasConsoleAccess/)
    for (const file of [
      'app/console/page.tsx',
      'app/console/events/page.tsx',
      'app/console/events/new/page.tsx',
      'app/console/events/[id]/edit/page.tsx',
      'app/console/events/[id]/preview/page.tsx',
      'app/console/events/[id]/shortlist/page.tsx',
    ]) {
      const page = read(file)
      expect(page).toMatch(/managesAnyEvent\(session\.user\)/)
      expect(page).toMatch(/redirect\('\/my-hackathons'\)/)
    }
    expect(read('components/footer.tsx')).not.toMatch(/href="\/console"/)
  })

  it('reserves event deletion for admins on API and UI (item 10c)', () => {
    const service = read('src/server/dashboard-service.ts')
    expect(service).toMatch(/actor\.role !== 'SUPERADMIN'[\s\S]*FORBIDDEN/)
    const panel = read('components/console/dashboard/settings-panel.tsx')
    expect(panel).toMatch(/\{isSuperadmin && \(/)
  })
})
