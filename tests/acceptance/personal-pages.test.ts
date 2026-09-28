import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('personal pages (IMPROVEMENTS.md items 1-4)', () => {
  it('routes the avatar menu at personal pages, not the public catalog', () => {
    const menu = read('src/lib/user-menu.ts')
    expect(menu).toMatch(/My Hackathons', href: '\/my-hackathons'/)
    expect(menu).toMatch(/My Projects', href: '\/my-projects'/)
    expect(menu).toMatch(/Account Settings', href: '\/settings'/)
    expect(menu).not.toMatch(/My Hackathons', href: '\/hackathons'/)
  })

  it('renders personal pages inside the site chrome (navbar + footer)', () => {
    for (const file of ['app/my-hackathons/layout.tsx', 'app/my-projects/layout.tsx']) {
      const layout = read(file)
      expect(layout).toMatch(/SiteChrome/)
      expect(layout).toMatch(/<SiteChrome>/)
    }
  })

  it('ships a my-hackathons page scoped to the viewer registrations', () => {
    const page = read('app/my-hackathons/page.tsx')
    expect(page).toMatch(/getMyEvents/)
    expect(page).toMatch(/redirect\('\/login'\)/)
    const service = read('src/server/event-service.ts')
    expect(service).toMatch(/export async function getMyEvents/)
  })

  it('ships my-projects and a project page with assets and an event path', () => {
    const mine = read('app/my-projects/page.tsx')
    expect(mine).toMatch(/getMyProjects/)
    expect(mine).toMatch(/\/projects\/\$\{project\.id\}/)
    const detail = read('app/projects/[id]/page.tsx')
    expect(detail).toMatch(/getGalleryProjectById/)
    expect(detail).toMatch(/<SubmissionAssets/)
    expect(detail).toMatch(/\/hackathons\/\$\{project\.eventSlug\}/)
    expect(detail).toMatch(/notFound\(\)/)
    const service = read('src/server/gallery-service.ts')
    expect(service).toMatch(/export async function getGalleryProjectById/)
    expect(service).toMatch(/export async function getMyProjects/)
    // In-flight work stays private except to its own team.
    expect(service).toMatch(/viewerId/)
    expect(service).toMatch(/teamMembers/)
  })

  it('ships an account settings page linked from the avatar menu', () => {
    const page = read('app/settings/page.tsx')
    expect(page).toMatch(/href="\/profile"/)
    expect(page).toMatch(/redirect\('\/login'\)/)
  })

  it('covers profile, security, appearance, and session settings', () => {
    const page = read('app/settings/page.tsx')
    expect(page).toMatch(/aria-label="Security"/)
    expect(page).toMatch(/<PasswordForm/)
    expect(page).toMatch(/aria-label="Appearance"/)
    expect(page).toMatch(/<ThemeToggle/)
    expect(page).toMatch(/aria-label="Session"/)
    expect(page).toMatch(/<LogoutButton/)
    const form = read('components/account/password-form.tsx')
    expect(form).toMatch(/apiChangePassword\(current, next\)/)
    expect(form).toMatch(/PASSWORD_RULES/)
    expect(form).toMatch(/INVALID_CREDENTIALS/)
  })

  it('rotates passwords only on proof of the current one', () => {
    const service = read('src/server/auth-service.ts')
    expect(service).toMatch(/export async function changePassword/)
    expect(service).toMatch(/verifyPassword\(user\.passwordHash, currentPassword\)/)
    expect(service).toMatch(/hashPassword\(newPassword\)/)
    const route = read('app/api/auth/password/route.ts')
    expect(route).toMatch(/requireSession\(\)/)
    expect(route).toMatch(/changePasswordRequestSchema/)
    expect(route).toMatch(/changePassword\(session\.user/)
    const client = read('lib/api-client.ts')
    expect(client).toMatch(/apiChangePassword/)
  })

  it('makes gallery cards open the project page with 30-per-page paging', () => {
    const browser = read('components/gallery-browser.tsx')
    expect(browser).toMatch(/PAGE_SIZE = 30/)
    expect(browser).toMatch(/href=\{`\/projects\/\$\{project\.id\}`\}/)
    expect(browser).toMatch(/Page \{safePage \+ 1\} of \{pageCount\}/)
  })

  it('makes the whole gallery card body clickable via a stretched title link (item 4)', () => {
    const browser = read('components/gallery-browser.tsx')
    // Card root establishes positioning context; the title link overlays it.
    expect(browser).toMatch(/<article[\s\S]*?className="relative flex flex-col/)
    expect(browser).toMatch(/after:absolute after:inset-0/)
    // External links stay above the overlay so they remain clickable.
    expect(browser).toMatch(/relative z-10 inline-flex/)
  })
})
