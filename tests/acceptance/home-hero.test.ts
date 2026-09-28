import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('homepage hero redesign', () => {
  it('leads with the reference copy and dual CTAs', () => {
    const hero = read('components/home/hero-section.tsx')
    expect(hero).toMatch(/Empowering innovators, shaping the future\./)
    expect(hero).toMatch(/Explore hackathons/)
    expect(hero).toMatch(/href="#hackathons"/)
    expect(hero).toMatch(/Host your event/)
    expect(hero).toMatch(/href="\/console\/events\/new"/)
    expect(hero).not.toMatch(/Upcoming:/)
    expect(hero).toMatch(/Artificial Intelligence/)
    expect(hero).toMatch(/Cybersecurity/)
    expect(hero).not.toMatch(/Quantum Leap/)
    // Transparent band: shares the fixed page-wide mesh backdrop (own 3D
    // cube canvas plus CSS glows on top), theme-aware copy colors only.
    expect(hero).not.toMatch(/bg-\[#e9f1f9\]/)
    expect(hero).not.toMatch(/dark:bg-\[#070b24\]/)
  })

  it('renders the 3D scene client-only with motion safeguards', () => {
    const hero = read('components/home/hero-section.tsx')
    expect(hero).toMatch(/dynamic\(\(\) => import\('\.\/hero-scene'\)/)
    expect(hero).toMatch(/ssr: false/)
    expect(hero).toMatch(/useReducedMotion/)
    expect(hero).toMatch(/hero-marquee/)
    const scene = read('components/home/hero-scene.tsx')
    expect(scene).toMatch(/THREE\.InstancedMesh/)
    expect(scene).toMatch(/prefers-reduced-motion/)
    expect(scene).toMatch(/IntersectionObserver/)
    expect(scene).toMatch(/aria-hidden="true"/)
    // Theme-aware palette, no remote assets.
    expect(scene).toMatch(/isDarkTheme/)
    expect(scene).not.toMatch(/http/)
  })
})

describe('showcase chrome (navbar + footer)', () => {
  it('tints the navbar glass per theme with a gradient hairline', () => {
    const nav = read('components/navbar.tsx')
    expect(nav).toMatch(/dark:bg-\[#070b24\]\/85/)
    expect(nav).toMatch(/via-cyan-500\/60/)
    expect(nav).toMatch(/from-\[#2f7bff\] to-fuchsia-500/)
    // Pill links, cyan active state, privileged Host gating intact.
    expect(nav).toMatch(/rounded-full px-3 py-1\.5/)
    expect(nav).toMatch(/text-cyan-700 dark:text-cyan-200/)
    expect(nav).toMatch(/showHost/)
  })

  it('paints the dark theme hero-blue instead of black', () => {
    const css = read('app/globals.css')
    // Both dark blocks (.dark + OS-preference fallback) share the blue base,
    // lifted enough to read blue (not black) next to the glowing hero canvas.
    expect(css.match(/--background: oklch\(0\.21 0\.055 273\);/g)).toHaveLength(2)
    expect(css).not.toMatch(/\.dark\s*\{[^}]*--background: oklch\(0\.145 0 0\)/)
    expect(css).toMatch(/--card: oklch\(0\.25 0\.05 273\);/)
  })
})

describe('homepage body (mesh backdrop, metrics, event cards)', () => {
  it('shows a procedural 3D trophy artifact for the organizer section', () => {
    const section = read('components/home/organizer-features.tsx')
    // Copy stays; the flat dashboard mockup is replaced by the artifact.
    expect(section).toMatch(/Everything you need to win your next hackathon/)
    expect(section).toMatch(/Team up with invite links/)
    expect(section).not.toMatch(/Match with teammates by skills/)
    expect(section).toMatch(/id="hackers"/)
    expect(section).toMatch(/Win real prizes/)
    expect(section).toMatch(/OrganizerArtifact/)
    expect(section).toMatch(/ssr: false/)
    expect(section).not.toMatch(/rounded-t-lg bg-\[#16a34a\]/)
    const artifact = read('components/home/organizer-artifact.tsx')
    expect(artifact).toMatch(/'use client'/)
    expect(artifact).toMatch(/LatheGeometry/)
    expect(artifact).toMatch(/TorusGeometry/)
    expect(artifact).toMatch(/prefers-reduced-motion/)
    expect(artifact).toMatch(/MutationObserver/)
    // Fully procedural: no remote models, textures, or fetches.
    expect(artifact).not.toMatch(/http/)
    expect(artifact).not.toMatch(/fetch\(/)
  })

  it('paints one fixed procedural mesh backdrop behind the whole home screen', () => {
    const page = read('app/(site)/page.tsx')
    expect(page).toMatch(/MeshBackdrop/)
    expect(page).toMatch(/mesh-backdrop/)
    const backdrop = read('components/home/mesh-backdrop.tsx')
    expect(backdrop).toMatch(/'use client'/)
    expect(backdrop).toMatch(/GridHelper/)
    expect(backdrop).toMatch(/Points/)
    expect(backdrop).toMatch(/fixed/)
    expect(backdrop).toMatch(/prefers-reduced-motion/)
    expect(backdrop).toMatch(/MutationObserver/)
    // Fully procedural: no remote models, textures, or fetches.
    expect(backdrop).not.toMatch(/http/)
    expect(backdrop).not.toMatch(/fetch\(/)
  })

  it('shows the static organization metrics in a responsive two-column grid', () => {
    const stats = read('components/home/stats-banner.tsx')
    // Marketing numbers about the organization — hardcoded, never from the db.
    expect(stats).toMatch(/35\+ events/)
    expect(stats).toMatch(/1000\+ projects/)
    expect(stats).toMatch(/3500\+ participants/)
    expect(stats).toMatch(/30\+ countries/)
    expect(stats).toMatch(/inventiveness/)
    expect(stats).toMatch(/pioneering/)
    expect(stats).toMatch(/collective quest/)
    expect(stats).toMatch(/cohesive/)
    expect(stats).toMatch(/sm:grid-cols-2/)
    expect(stats).not.toMatch(/grid-cols-3/)
    expect(stats).not.toMatch(/getHackathonEvents|from.*db/)
    expect(stats).not.toMatch(/text-slate-/)
  })

  it('renders big clickable event cards with banners, at most two across', () => {
    const card = read('components/event-card.tsx')
    expect(card).toMatch(/cardBannerUrl/)
    expect(card).toMatch(/h-\[360px\]/)
    expect(card).toMatch(/h-44.*md:h-56/)
    expect(card).toMatch(/line-clamp-2/)
    expect(card).toMatch(/mt-auto/)
    expect(card).toMatch(/loading="lazy"/)
    expect(card).toMatch(/hackathons\/\$\{event\.slug\}/)
    const listing = read('components/home/active-hackathons.tsx')
    expect(listing).toMatch(/md:grid-cols-2/)
    expect(listing).not.toMatch(/md:grid-cols-3/)
    // Banner plumbed from the db row through the listing type.
    expect(read('src/lib/hackathons.ts')).toMatch(/cardBannerUrl/)
    expect(read('src/server/hackathons-service.ts')).toMatch(/cardBannerUrl/)
  })

  it('renders the footer from global theme tokens (theme-responsive)', () => {
    const footer = read('components/footer.tsx')
    // Surfaces and text follow the global tokens so one token change
    // recolors the footer; cyan divider accent is theme-agnostic.
    expect(footer).toMatch(/bg-card/)
    expect(footer).toMatch(/text-muted-foreground/)
    expect(footer).toMatch(/border-border/)
    expect(footer).toMatch(/via-cyan-400\/50/)
    // No hardcoded per-component theme-blind colors remain.
    expect(footer).not.toMatch(/bg-\[#070b24\]/)
    expect(footer).not.toMatch(/text-slate-/)
    expect(footer).not.toMatch(/border-white\//)
    expect(footer).not.toMatch(/bg-white\/5/)
  })
})
