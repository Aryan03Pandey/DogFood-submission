import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildStorageKey,
  publicUploadUrl,
  uploadErrorFor,
  UPLOAD_DIMENSION_HINTS,
} from '../../src/lib/upload'
import {
  emptyWizard,
  timelinePayload,
  validateBasics,
  validatePrizes,
  validateRules,
  validateTier,
  validateTimeline,
  validateTracks,
  wizardFromEvent,
  WIZARD_STEPS,
} from '../../src/lib/event-creation'
import { updateEventSchema } from '../../src/lib/api/schemas'
import { sanitizeDescriptionHtml } from '../../src/lib/sanitize'

describe('wizard basics', () => {
  it('requires a title and a well-formed slug', () => {
    expect(validateBasics({ title: '', slug: '' }).length).toBeGreaterThan(0)
    expect(validateBasics({ title: 'Dogfood 2027', slug: 'Dogfood 2027!' })).toEqual([
      'Slug must be lowercase letters, numbers, and hyphens.',
    ])
    expect(validateBasics({ title: 'Dogfood 2027', slug: 'dogfood-2027' })).toEqual([])
  })
})

describe('wizard timeline', () => {
  const base = {
    ...emptyWizard(),
    registrationEnd: '2027-02-01T00:00:00.000Z',
    submissionDeadline: '2027-03-01T18:00:00.000Z',
    judgingEndTime: '2027-03-11T18:00:00.000Z',
    votingEnabled: true,
    publicVotingEndTime: '2027-03-18T18:00:00.000Z',
  }

  it('accepts a forward-running schedule', () => {
    expect(validateTimeline(base)).toEqual([])
  })

  it('requires registration end plus the core deadlines and voting end when voting is on', () => {
    expect(validateTimeline({ ...emptyWizard(), votingEnabled: true }).length).toBeGreaterThan(0)
    expect(
      validateTimeline({ ...emptyWizard(), votingEnabled: false, registrationEnd: null }),
    ).toContain('Registration End is required.')
  })

  it('rejects a deadline before its start', () => {
    expect(
      validateTimeline({ ...base, submissionDeadline: '2027-01-01T00:00:00.000Z' }),
    ).not.toEqual([])
  })

  it('drops voting dates from the payload when voting is off', () => {
    const payload = timelinePayload({
      ...base,
      votingEnabled: false,
      publicVotingStart: '2027-03-11T18:00:00.000Z',
      publicVotingEndTime: '2027-03-18T18:00:00.000Z',
    })
    expect(payload.publicVotingStart).toBe(null)
    expect(payload.publicVotingEndTime).toBe(null)
    expect(payload.submissionDeadline).toBe('2027-03-01T18:00:00.000Z')
  })

  it('passes the timeline PATCH payload (nulls for unset dates) through updateEventSchema', () => {
    const payload = { ...timelinePayload(base), announcementDate: null }
    const result = updateEventSchema.safeParse(payload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.publicVotingStart).toBe(null)
      expect(result.data.registrationEnd).toBeInstanceOf(Date)
    }
  })

  it('drops the retired start/end fields from the timeline payload', () => {
    const payload = timelinePayload(base)
    expect(payload).not.toHaveProperty('startTime')
    expect(payload).not.toHaveProperty('registrationStart')
    expect(payload).not.toHaveProperty('endDate')
    expect(Object.keys(payload)).toContain('registrationEnd')
  })
})

describe('wizard tracks', () => {
  it('sits right after description and allows zero tracks', () => {
    const ids = WIZARD_STEPS.map((step) => step.id)
    expect(ids).toEqual(['media', 'basics', 'description', 'tracks', 'timeline', 'rules', 'prizes'])
    expect(validateTracks(emptyWizard())).toEqual([])
  })

  it('requires a title per track and caps descriptions at 200 characters', () => {
    const base = emptyWizard()
    expect(validateTracks({ ...base, tracks: [{ key: 'a', name: '', description: '' }] })).toContain(
      'Track 1 needs a title.',
    )
    expect(
      validateTracks({ ...base, tracks: [{ key: 'a', name: 'AI', description: 'x'.repeat(201) }] }),
    ).toContain('Track 1 description must be 200 characters or fewer.')
    expect(
      validateTracks({ ...base, tracks: [{ key: 'a', name: 'AI', description: 'x'.repeat(200) }] }),
    ).toEqual([])
  })
})

describe('wizard rules', () => {
  it('rejects min above max for team events', () => {
    expect(
      validateRules({
        participationType: 'TEAM',
        minTeamSize: 5,
        maxTeamSize: 2,
        format: 'ONLINE',
        locationName: '',
      }),
    ).toEqual(['Minimum team size must not exceed maximum team size.'])
  })

  it('requires a location for offline and hybrid events only', () => {
    const team = { participationType: 'TEAM' as const, minTeamSize: 1, maxTeamSize: 4 }
    expect(validateRules({ ...team, format: 'OFFLINE', locationName: '' })).not.toEqual([])
    expect(validateRules({ ...team, format: 'HYBRID', locationName: '' })).not.toEqual([])
    expect(validateRules({ ...team, format: 'ONLINE', locationName: '' })).toEqual([])
    expect(validateRules({ ...team, format: 'OFFLINE', locationName: 'Hall' })).toEqual([])
  })
})

describe('wizard prizes', () => {
  it('requires at least one tier and the lock-in acknowledgment', () => {
    expect(validatePrizes({ tiers: [], participationCertificate: false, acknowledged: false }).length).toBe(2)
    expect(
      validatePrizes({
        tiers: [
          { key: 'a', title: 'Grand', kind: 'MONETARY', amount: '5000', currency: 'USD', trackId: '' },
        ],
        participationCertificate: true,
        acknowledged: true,
      }),
    ).toEqual([])
  })

  it('requires amounts for monetary tiers but not certificates', () => {
    expect(
      validateTier({ key: 'a', title: 'T', kind: 'MONETARY', amount: '', currency: 'USD', trackId: '' }),
    ).not.toEqual([])
    expect(
      validateTier({ key: 'a', title: 'T', kind: 'CERTIFICATE', amount: '', currency: '', trackId: '' }),
    ).toEqual([])
  })

  it('rejects bad currency codes', () => {
    expect(
      validateTier({ key: 'a', title: 'T', kind: 'MONETARY', amount: '10', currency: 'USDD', trackId: '' }),
    ).not.toEqual([])
  })
})

describe('preview description truncation', () => {
  const root = join(__dirname, '..', '..')
  const expandable = readFileSync(join(root, 'components/console/expandable-html.tsx'), 'utf8')
  const preview = readFileSync(join(root, 'components/console/event-preview.tsx'), 'utf8')

  it('clamps long descriptions behind an inline Show more toggle', () => {
    expect(expandable).toMatch(/'use client'/)
    expect(expandable).toMatch(/line-clamp-6/)
    expect(expandable).toMatch(/Show more/)
    expect(expandable).toMatch(/Show less/)
    expect(expandable).toMatch(/scrollHeight/)
    expect(preview).toMatch(/EventTabs/)
    expect(readFileSync(join(root, 'components/event-page/event-tabs.tsx'), 'utf8')).toMatch(
      /ExpandableHtml/,
    )
  })
})

describe('description sanitization', () => {
  it('keeps formatting and links while hardening them', () => {
    const clean = sanitizeDescriptionHtml(
      '<p><strong>Hi</strong> <a href="https://example.org">click</a></p>',
    )
    expect(clean).toContain('<strong>Hi</strong>')
    expect(clean).toContain('target="_blank"')
    expect(clean).toContain('rel="noreferrer noopener"')
  })

  it('drops scripts entirely, and blanks to null', () => {
    expect(sanitizeDescriptionHtml('<p>x</p><script>alert(1)</script>')).toBe('<p>x</p>')
    expect(sanitizeDescriptionHtml('   ')).toBe(null)
    expect(sanitizeDescriptionHtml(null)).toBe(null)
  })
})

describe('upload helpers', () => {
  it('rejects non-images and oversized files', () => {
    expect(uploadErrorFor({ mime: 'application/pdf', sizeBytes: 100, filename: 'a.pdf' })).toBe(
      'UNSUPPORTED_TYPE',
    )
    expect(uploadErrorFor({ mime: 'image/png', sizeBytes: 6 * 1024 * 1024, filename: 'a.png' })).toBe(
      'TOO_LARGE',
    )
    expect(uploadErrorFor({ mime: 'image/png', sizeBytes: 100, filename: 'a.png' })).toBe(null)
    expect(uploadErrorFor({ mime: null, sizeBytes: 100, filename: 'a.png' })).toBe('MISSING_FILE')
  })

  it('builds scoped, sanitized storage keys', () => {
    const key = buildStorageKey('logo', 'evt-1', '../../Evil Logo!.PNG')
    expect(key.startsWith('events/evt-1/logo-')).toBe(true)
    expect(key).not.toContain('..')
    expect(key).not.toContain(' ')
  })

  it('documents a dimension hint per slot', () => {
    expect(Object.keys(UPLOAD_DIMENSION_HINTS).sort()).toEqual(['banner', 'card', 'logo'])
  })

  it('prefixes the public read base', () => {
    expect(publicUploadUrl('dogfood-assets/a.png')).toContain('dogfood-assets/a.png')
  })
})

describe('wizard edit prefill', () => {
  const source = {
    event: {
      id: 'evt-1',
      slug: 'dogfood-2027',
      title: 'Dogfood 2027',
      logoUrl: 'dogfood-assets/logo.png',
      bannerUrl: null,
      cardBannerUrl: null,
      websiteUrl: 'https://example.com',
      format: 'HYBRID',
      locationName: 'Hall',
      locationAddress: null,
      mapsUrl: null,
      descriptionHtml: '<p>Hi</p>',
      registrationEnd: '2027-01-10T00:00:00.000Z',
      submissionStart: null,
      submissionDeadline: '2027-02-10T00:00:00.000Z',
      judgingStart: '2027-02-11T00:00:00.000Z',
      judgingEndTime: '2027-02-20T00:00:00.000Z',
      publicVotingStart: null,
      publicVotingEndTime: null,
      announcementDate: null,
      participationType: 'TEAM',
      minTeamSize: 2,
      maxTeamSize: 4,
      audience: 'OPEN',
      participationCertificate: true,
    },
    tracks: [{ id: 't1', name: 'General', description: null }],
    prizes: [
      { id: 'p1', title: 'First', kind: 'MONETARY', cashValue: 5000, currency: 'USD', trackId: null },
    ],
  }

  it('flattens rows into wizard state with ids preserved', () => {
    const data = wizardFromEvent(source)
    expect(data.eventId).toBe('evt-1')
    expect(data.slug).toBe('dogfood-2027')
    expect(data.title).toBe('Dogfood 2027')
    expect(data.registrationEnd).toBe('2027-01-10T00:00:00.000Z')
    expect(data.votingEnabled).toBe(false)
    expect(new Date(data.registrationEnd!).getTime()).not.toBeNaN()
    expect(data.tracks).toEqual([{ key: 'track-t1', id: 't1', name: 'General', description: '' }])
    expect(data.tiers).toEqual([
      { key: 'tier-p1', id: 'p1', title: 'First', kind: 'MONETARY', amount: '5000', currency: 'USD', trackId: '' },
    ])
    expect(data.participationCertificate).toBe(true)
    expect(data.acknowledged).toBe(false)
  })

  it('prefilled data passes the same validators as creation', () => {
    const data = { ...wizardFromEvent(source), acknowledged: true }
    expect(validateTimeline(data)).toEqual([])
    expect(validateTracks({ tracks: data.tracks })).toEqual([])
    expect(validatePrizes(data)).toEqual([])
  })

  it('prefills every date field with the stored value', () => {
    const withDates = {
      ...source,
      event: {
        ...source.event,
        submissionStart: '2027-01-11T09:00:00.000Z',
        judgingStart: '2027-02-11T09:00:00.000Z',
        judgingEndTime: '2027-02-20T17:00:00.000Z',
        publicVotingStart: '2027-02-21T09:00:00.000Z',
        publicVotingEndTime: '2027-02-25T17:00:00.000Z',
        announcementDate: '2027-02-28T12:00:00.000Z',
      },
    }
    const data = wizardFromEvent(withDates)
    const dates = [
      data.registrationEnd,
      data.submissionStart,
      data.submissionDeadline,
      data.judgingStart,
      data.judgingEndTime,
      data.publicVotingStart,
      data.publicVotingEndTime,
      data.announcementDate,
    ]
    expect(dates).toHaveLength(8)
    for (const iso of dates) {
      expect(typeof iso).toBe('string')
      expect(new Date(iso!).getTime()).not.toBeNaN()
    }
    expect(data.submissionStart).toBe('2027-01-11T09:00:00.000Z')
    expect(data.announcementDate).toBe('2027-02-28T12:00:00.000Z')
  })
})

describe('event edit surface contract', () => {
  const root = join(__dirname, '..', '..')
  const read = (path: string) => readFileSync(join(root, path), 'utf8')

  it('gates the edit page to organizers and reuses the wizard in both modes', () => {
    const page = read('app/console/events/[id]/edit/page.tsx')
    expect(page).toMatch(/getEffectiveRole/)
    expect(page).toMatch(/ORGANIZER/)
    expect(page).toMatch(/wizardFromEvent/)
    expect(page).toMatch(/mode="edit"/)
    expect(page).toMatch(/live=\{live\}/)
    expect(page).not.toMatch(/can no longer be edited/)
  })

  it('offers Save and Preview only in edit mode', () => {
    const wizard = read('components/console/event-wizard.tsx')
    expect(wizard).toMatch(/mode\?: 'create' \| 'edit'/)
    expect(wizard).toMatch(/editMode \? \(/)
    expect(wizard).toMatch(/Save and Preview/)
  })

  it('freezes titles, rules, tracks, and prizes on live events', () => {
    const service = read('src/server/event-service.ts')
    expect(service).toMatch(/LIVE_EDITABLE_EVENT_FIELDS/)
    expect(service).toMatch(/"websiteUrl"/)
    expect(service).toMatch(/LIVE_EDIT_LOCKED/)
    expect(service).toMatch(/deriveEventStatus\(event\) !== "DRAFT"\) throw new AuthError\("PRIZE_LOCKED"/)
    const wizard = read('components/console/event-wizard.tsx')
    expect(wizard).toMatch(/liveLocked = editMode && live/)
    expect(wizard).toMatch(/liveLocked={liveLocked}/)
    expect(wizard).toMatch(/liveLocked && \(id === 'rules' \|\| id === 'tracks' \|\| id === 'prizes'\)\) return true/)
    for (const step of ['basics-step', 'rules-step', 'tracks-step', 'prizes-step']) {
      expect(read(`components/console/wizard-steps/${step}.tsx`)).toMatch(/liveLocked\?: boolean/)
    }
  })

  it('always links the overview Edit event button', () => {
    const panel = read('components/console/dashboard/overview-panel.tsx')
    expect(panel).toMatch(/Edit event/)
    expect(panel).toMatch(/\/console\/events\/\$\{event\.id\}\/edit/)
    expect(panel).not.toMatch(/Only draft events can be edited/)
  })
})
