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

  it('reserves event deletion for admins on API and UI (item 10c)', () => {
    const service = read('src/server/dashboard-service.ts')
    expect(service).toMatch(/actor\.role !== 'SUPERADMIN'[\s\S]*FORBIDDEN/)
    const panel = read('components/console/dashboard/settings-panel.tsx')
    expect(panel).toMatch(/\{isSuperadmin && \(/)
  })
})
