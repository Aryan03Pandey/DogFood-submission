import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// First-visit theme regression: with no stored choice and a dark OS, the
// page used to get dark :root tokens but no .dark class, so `dark:`
// variants never fired (dark text on a dark hero). This runs the exact
// blocking script bytes shipped in <head> under stubbed globals.
const root = join(__dirname, '..', '..')

function extractScript(): string {
  const layout = readFileSync(join(root, 'app', 'layout.tsx'), 'utf8')
  const match = layout.match(/const themeInitScript = `([\s\S]*?)`/)
  if (!match) throw new Error('themeInitScript not found in app/layout.tsx')
  return match[1]
}

function runScript(stored: string | null, osDark: boolean): string[] {
  const classes = new Set<string>()
  const sandbox = {
    document: { documentElement: { classList: { add: (c: string) => classes.add(c) } } },
    localStorage: { getItem: () => stored },
    window: { matchMedia: () => ({ matches: osDark }) },
  }
  const fn = new Function('document', 'localStorage', 'window', extractScript())
  fn(sandbox.document, sandbox.localStorage, sandbox.window)
  return [...classes]
}

describe('blocking theme init script', () => {
  it('honors a stored choice', () => {
    expect(runScript('dark', false)).toEqual(['dark'])
    expect(runScript('light', true)).toEqual(['light'])
  })

  it('falls back to the OS preference with no stored choice', () => {
    expect(runScript(null, true)).toEqual(['dark'])
    expect(runScript(null, false)).toEqual(['light'])
  })
})
