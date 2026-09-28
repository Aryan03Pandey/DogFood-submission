import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('team fixes (IMPROVEMENTS.md items 5-8)', () => {
  it('unregisters the viewer when the last member leaves (item 5)', () => {
    const service = read('src/server/team-service.ts')
    // Team deletion also drops the event-role row, so the event page no
    // longer sees a registered viewer with no team (Manage Team).
    expect(service).toMatch(/\.delete\(eventRoles\)/)
    const access = read('src/lib/event-access.ts')
    expect(access).toMatch(/Manage Team/)
  })

  it('warns and confirms before leaving, no password (item 6)', () => {
    const ui = read('components/team/manage-team.tsx')
    expect(ui).toMatch(/setConfirming\('leave'\)/)
    expect(ui).toMatch(/you are the last member/i)
    expect(ui).toMatch(/Confirm leave/)
    // Leave confirmation is a plain confirm: only submit and cancel use
    // password fields.
    expect(ui.match(/type="password"/g)).toHaveLength(2)
  })

  it('scopes pending labels so rename never flashes the code generator (item 7)', () => {
    const ui = read('components/team/manage-team.tsx')
    expect(ui).toMatch(/workingLabel === 'Rotation' \? 'Generating/)
    expect(ui).toMatch(/workingLabel === 'Rename' \? 'Saving/)
    expect(ui).not.toMatch(/\{working \? 'Generating/)
  })

  it('holds one confirm at a time: cancel and submit cannot overlap (item 8)', () => {
    const ui = read('components/team/manage-team.tsx')
    expect(ui).toMatch(/confirming !== 'submit'/)
    expect(ui).toMatch(/confirming !== 'cancel'/)
    expect(ui).not.toMatch(/confirmingSubmit/)
    expect(ui).not.toMatch(/confirmingDelete/)
  })
})
