import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')
const navbar = readFileSync(join(root, 'components/navbar.tsx'), 'utf8')

describe('navbar Host an Event visibility', () => {
  it('never shows Host an Event to signed-out visitors', () => {
    const showHostLine = navbar.split('\n').find((line) => line.includes('showHost ='))
    expect(showHostLine).toBeDefined()
    expect(showHostLine).not.toMatch(/!user/)
  })

  it('gates Host an Event on a signed-in privileged role', () => {
    expect(navbar).toMatch(/showHost[^;]*(SUPERADMIN|managesEvents)/)
  })
})
