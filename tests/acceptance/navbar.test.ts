import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')
const navbar = readFileSync(join(root, 'components/navbar.tsx'), 'utf8')

describe('site chrome sticky body', () => {
  it('keeps the body viewport-tall with the footer pushed down on short pages', () => {
    const chrome = readFileSync(join(root, 'components/site-chrome.tsx'), 'utf8')
    expect(chrome).toMatch(/flex min-h-screen flex-col/)
    expect(chrome).toMatch(/flex flex-1 flex-col/)
  })
})

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
