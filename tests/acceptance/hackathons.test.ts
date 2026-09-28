import { describe, expect, it } from 'vitest'
import { classifyEventTab, isShowcaseEvent } from '../../src/lib/hackathons'
import { isActiveNavItem } from '../../src/lib/nav'
import { visibleMenuGroups } from '../../src/lib/user-menu'

describe('hackathon tabs', () => {
  it('lists open events as live', () => {
    expect(classifyEventTab('REGISTRATION')).toBe('live')
    expect(classifyEventTab('SUBMISSION')).toBe('live')
  })

  it('lists unopened events as upcoming', () => {
    expect(classifyEventTab('DRAFT')).toBe('upcoming')
  })

  it('lists judged and closed events as past', () => {
    expect(classifyEventTab('JUDGING')).toBe('past')
    expect(classifyEventTab('PUBLIC_VOTING')).toBe('past')
    expect(classifyEventTab('PUBLISHED')).toBe('past')
  })
})

describe('homepage showcase filter', () => {
  it('shows live and upcoming events, never past ones', () => {
    expect(isShowcaseEvent('live')).toBe(true)
    expect(isShowcaseEvent('upcoming')).toBe(true)
    expect(isShowcaseEvent('past')).toBe(false)
  })
})

describe('account dropdown visibility', () => {
  const labels = (role: string | undefined, manages: boolean) =>
    visibleMenuGroups(role, manages).flat().map((item) => item.label)

  it('hides Organizer Dashboard from participants', () => {
    const shown = labels('PARTICIPANT', false)
    expect(shown).not.toContain('Organizer Dashboard')
    expect(shown).toEqual(
      expect.arrayContaining(['Edit Profile', 'My Hackathons', 'My Projects', 'Account Settings']),
    )
  })

  it('hides personal rows from SUPERADMINs', () => {
    const shown = labels('SUPERADMIN', true)
    expect(shown).not.toContain('My Hackathons')
    expect(shown).not.toContain('My Projects')
    expect(shown).toEqual(
      expect.arrayContaining(['Edit Profile', 'Organizer Dashboard', 'Account Settings']),
    )
  })

  it('shows everything to organizers', () => {
    const shown = labels('ORGANIZER', true)
    expect(shown).toEqual(
      expect.arrayContaining([
        'Edit Profile',
        'My Hackathons',
        'My Projects',
        'Organizer Dashboard',
        'Account Settings',
      ]),
    )
  })
})

describe('navbar active page', () => {
  it('matches each page to its own link', () => {
    expect(isActiveNavItem('/', '/')).toBe(true)
    expect(isActiveNavItem('/hackathons', '/hackathons')).toBe(true)
    expect(isActiveNavItem('/projects', '/projects')).toBe(true)
  })

  it('does not highlight Home on subpages', () => {
    expect(isActiveNavItem('/', '/hackathons')).toBe(false)
    expect(isActiveNavItem('/', '/projects')).toBe(false)
  })

  it('keeps the section highlighted on event detail pages', () => {
    expect(isActiveNavItem('/hackathons', '/hackathons/nebula-build-week')).toBe(true)
    expect(isActiveNavItem('/projects', '/hackathons')).toBe(false)
  })
})
