import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')

function pageFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...pageFiles(full))
    else if (entry === 'page.tsx') out.push(full)
  }
  return out
}

describe('page main sections are full width', () => {
  it('gives every app page main w-full', () => {
    const files = pageFiles(join(root, 'app'))
    expect(files.length).toBeGreaterThan(0)
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8')
      const mains = source.match(/<main(\s[^>]*)?>/g) ?? []
      return mains.some((tag) => !tag.includes('w-full'))
    })
    expect(offenders).toEqual([])
  })
})
