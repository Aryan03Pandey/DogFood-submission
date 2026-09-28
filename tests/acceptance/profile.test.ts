import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasCompleteProfile, profileCompletion } from '../../src/lib/profile'
import { profileUpdateSchema } from '../../src/lib/api/schemas'

const root = join(__dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const empty = {
  firstName: null,
  lastName: null,
  email: 'a@local',
  countryCode: null,
  phoneNumber: null,
  profession: null,
  country: null,
  skills: [],
  projectCount: 0,
  linkedinUrl: null,
  githubUrl: null,
} as const

describe('profile completion', () => {
  it('scores an untouched profile at one of nine with three required missing', () => {
    const result = profileCompletion({ ...empty })
    expect(result.percent).toBe(11)
    expect(result.complete).toBe(false)
    expect(result.missing).toEqual(['First name', 'Last name', 'Profession'])
  })

  it('scores a full profile at one hundred and complete', () => {
    const result = profileCompletion({
      ...empty,
      firstName: 'Ada',
      lastName: 'Lovelace',
      countryCode: '+44',
      phoneNumber: '7700 900123',
      profession: 'PROFESSIONAL',
      country: 'United Kingdom',
      skills: ['TypeScript'],
      projectCount: 1,
      linkedinUrl: 'https://linkedin.com/in/ada',
      githubUrl: null,
    })
    expect(result).toEqual({ percent: 100, complete: true, missing: [] })
  })

  it('counts either social as the socials slot', () => {
    expect(
      profileCompletion({ ...empty, githubUrl: 'https://github.com/ada' }).percent,
    ).toBe(22)
  })

  it('gates registration on first name, last name, and profession', () => {
    expect(
      hasCompleteProfile({ firstName: 'Ada', lastName: 'Lovelace', profession: 'STUDENT' }),
    ).toBe(true)
    expect(
      hasCompleteProfile({ firstName: '', lastName: 'Lovelace', profession: 'STUDENT' }),
    ).toBe(false)
    expect(
      hasCompleteProfile({ firstName: 'Ada', lastName: 'Lovelace', profession: null }),
    ).toBe(false)
    expect(
      hasCompleteProfile({ firstName: null, lastName: null, profession: null }),
    ).toBe(false)
  })
})

describe('profile update schema', () => {
  const valid = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    countryCode: '+91',
    phoneNumber: '98765 43210',
    profession: 'STUDENT',
    country: 'India',
    skills: ['TypeScript', 'React'],
    linkedinUrl: 'https://linkedin.com/in/ada',
    githubUrl: 'https://github.com/ada',
    projects: [
      {
        title: 'Glass Signal',
        description: 'Short desc',
        repoUrl: 'https://github.com/ada/glass',
        hostedUrl: 'https://glass.example.com',
      },
    ],
  }

  it('accepts a complete valid profile', () => {
    expect(profileUpdateSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts an all-empty profile so incomplete profiles save', () => {
    expect(
      profileUpdateSchema.safeParse({
        firstName: null,
        lastName: null,
        countryCode: null,
        phoneNumber: null,
        profession: null,
        country: null,
        skills: [],
        linkedinUrl: null,
        githubUrl: null,
        projects: [],
      }).success,
    ).toBe(true)
  })

  it('rejects bad names, phones, and off-domain socials', () => {
    expect(profileUpdateSchema.safeParse({ ...valid, firstName: 'Ada123' }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ ...valid, phoneNumber: 'abc' }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ ...valid, countryCode: '91' }).success).toBe(false)
    expect(
      profileUpdateSchema.safeParse({ ...valid, linkedinUrl: 'https://github.com/ada' }).success,
    ).toBe(false)
    expect(
      profileUpdateSchema.safeParse({ ...valid, githubUrl: 'not-a-url' }).success,
    ).toBe(false)
    expect(
      profileUpdateSchema.safeParse({
        ...valid,
        projects: [{ title: '', repoUrl: 'https://github.com/ada/x' }],
      }).success,
    ).toBe(false)
  })
})

describe('profile surface contract', () => {
  it('serves the profile page with the form under site chrome', () => {
    const page = read('app/(site)/profile/page.tsx')
    expect(page).toMatch(/ProfileForm/)
    expect(page).toMatch(/\/login/)
  })

  it('never leaks password hashes from the profile service', () => {
    expect(read('src/server/profile-service.ts')).toMatch(/passwordHash: _passwordHash/)
  })

  it('marks required fields and meters completion in the form', () => {
    const form = read('components/profile/profile-form.tsx')
    expect(form).toMatch(/aria-required="true"/)
    expect(form).toMatch(/role="progressbar"/)
    expect(form).toMatch(/SUGGESTED_SKILLS/)
    expect(form).toMatch(/Add project/)
  })

  it('takes the user home after saving', () => {
    expect(read('components/profile/profile-form.tsx')).toMatch(/router\.push\('\/'\)/)
  })

  it('never blocks saving on empty required fields and persists completeness', () => {
    const form = read('components/profile/profile-form.tsx')
    expect(form).not.toMatch(/is required for a complete profile/)
    expect(read('src/server/profile-service.ts')).toMatch(/profileComplete:/)
    expect(read('drizzle/0008_profile_complete.sql')).toMatch(/profile_complete/)
  })
})
