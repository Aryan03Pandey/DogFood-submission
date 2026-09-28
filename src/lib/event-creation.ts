// Creation-wizard data model and step validators (EVENT-CREATION.md).
// Pure and UI-free so the whole step logic is unit-testable; the wizard
// shell and the API share these instead of reimplementing the rules.

export type WizardFormat = 'ONLINE' | 'OFFLINE' | 'HYBRID'
export type WizardParticipation = 'INDIVIDUAL' | 'TEAM'
export type WizardAudience = 'STUDENT' | 'PROFESSIONAL' | 'OPEN'
export type PrizeKind = 'MONETARY' | 'IN_KIND' | 'CERTIFICATE'

export interface PrizeTierInput {
  key: string
  // Present once the tier exists server-side; absent for local-only rows.
  id?: string
  title: string
  kind: PrizeKind
  amount: string
  currency: string
  trackId: string
}

export interface TrackInput {
  key: string
  // Present once the track exists server-side; absent for local-only rows.
  id?: string
  name: string
  description: string
}

export interface WizardData {
  eventId: string | null
  slug: string
  title: string
  logoUrl: string | null
  bannerUrl: string | null
  cardBannerUrl: string | null
  websiteUrl: string
  format: WizardFormat
  locationName: string
  locationAddress: string
  mapsUrl: string
  descriptionHtml: string
  registrationEnd: string | null
  submissionStart: string | null
  submissionDeadline: string | null
  judgingStart: string | null
  judgingEndTime: string | null
  votingEnabled: boolean
  publicVotingStart: string | null
  publicVotingEndTime: string | null
  announcementDate: string | null
  participationType: WizardParticipation
  minTeamSize: number
  maxTeamSize: number
  audience: WizardAudience
  tracks: TrackInput[]
  tiers: PrizeTierInput[]
  participationCertificate: boolean
  acknowledged: boolean
}

export const WIZARD_STEPS = [
  { id: 'media', label: 'Media' },
  { id: 'basics', label: 'Basics' },
  { id: 'description', label: 'Description' },
  { id: 'tracks', label: 'Tracks' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'rules', label: 'Participation Rules' },
  { id: 'prizes', label: 'Prizes' },
] as const

export type WizardStepId = (typeof WIZARD_STEPS)[number]['id']

export function emptyWizard(): WizardData {
  return {
    eventId: null,
    slug: '',
    title: '',
    logoUrl: null,
    bannerUrl: null,
    cardBannerUrl: null,
    websiteUrl: '',
    format: 'ONLINE',
    locationName: '',
    locationAddress: '',
    mapsUrl: '',
    descriptionHtml: '',
    registrationEnd: null,
    submissionStart: null,
    submissionDeadline: null,
    judgingStart: null,
    judgingEndTime: null,
    votingEnabled: true,
    publicVotingStart: null,
    publicVotingEndTime: null,
    announcementDate: null,
    participationType: 'TEAM',
    minTeamSize: 1,
    maxTeamSize: 4,
    audience: 'OPEN',
    tracks: [],
    tiers: [],
    participationCertificate: false,
    acknowledged: false,
  }
}

// Slug derivation for the basics step: the slug fills itself in from the
// title, so organizers never type it. Manual tweaks survive until the shell
// exists; afterwards the slug locks as the stable public identifier.
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

export function validateBasics(data: Pick<WizardData, 'title' | 'slug'>): string[] {
  const errors: string[] = []
  if (data.title.trim() === '') errors.push('Title is required.')
  if (data.slug.trim() === '') {
    errors.push('Slug is required.')
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug.trim())) {
    errors.push('Slug must be lowercase letters, numbers, and hyphens.')
  }
  return errors
}

const TIMELINE_CHAIN = [
  'registrationEnd',
  'submissionStart',
  'submissionDeadline',
  'judgingStart',
  'judgingEndTime',
  'publicVotingStart',
  'publicVotingEndTime',
] as const

type TimelineSlice = Pick<WizardData, (typeof TIMELINE_CHAIN)[number] | 'votingEnabled'>

export function validateTimeline(data: TimelineSlice): string[] {
  const errors: string[] = []
  const required: Array<(typeof TIMELINE_CHAIN)[number]> = [
    'registrationEnd',
    'submissionDeadline',
    'judgingEndTime',
  ]
  if (data.votingEnabled) required.push('publicVotingEndTime')
  for (const key of required) {
    if (data[key] == null) errors.push(`${labelFor(key)} is required.`)
  }
  const present = TIMELINE_CHAIN.filter(
    (key): key is (typeof TIMELINE_CHAIN)[number] => {
      if (!data.votingEnabled && (key === 'publicVotingStart' || key === 'publicVotingEndTime')) {
        return false
      }
      return data[key] != null
    },
  )
  for (let index = 1; index < present.length; index += 1) {
    const prev = new Date(data[present[index - 1]] as string).getTime()
    const next = new Date(data[present[index]] as string).getTime()
    if (Number.isNaN(prev) || Number.isNaN(next) || next < prev) {
      errors.push(`${labelFor(present[index])} must not be before ${labelFor(present[index - 1])}.`)
    }
  }
  return errors
}

function labelFor(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (first) => first.toUpperCase())
}

export function validateRules(
  data: Pick<WizardData, 'participationType' | 'minTeamSize' | 'maxTeamSize' | 'format' | 'locationName'>,
): string[] {
  const errors: string[] = []
  if (
    data.participationType === 'TEAM' &&
    Number.isSafeInteger(data.minTeamSize) &&
    Number.isSafeInteger(data.maxTeamSize) &&
    data.minTeamSize > data.maxTeamSize
  ) {
    errors.push('Minimum team size must not exceed maximum team size.')
  }
  if ((data.format === 'OFFLINE' || data.format === 'HYBRID') && data.locationName.trim() === '') {
    errors.push('Location name is required for offline and hybrid events.')
  }
  return errors
}

export const MAX_TRACK_DESCRIPTION_LENGTH = 200

// Tracks are optional (an event can have none), but every added track needs
// a title and a short description within the limit.
export function validateTracks(data: Pick<WizardData, 'tracks'>): string[] {
  const errors: string[] = []
  data.tracks.forEach((track, index) => {
    const label = `Track ${index + 1}`
    if (track.name.trim() === '') errors.push(`${label} needs a title.`)
    if (track.description.length > MAX_TRACK_DESCRIPTION_LENGTH) {
      errors.push(`${label} description must be ${MAX_TRACK_DESCRIPTION_LENGTH} characters or fewer.`)
    }
  })
  return errors
}

export function validateTier(tier: PrizeTierInput): string[] {
  const errors: string[] = []
  if (tier.title.trim() === '') errors.push('Each tier needs a title.')
  if (tier.kind !== 'CERTIFICATE') {
    const amount = Number.parseInt(tier.amount, 10)
    if (tier.amount.trim() === '' || !Number.isSafeInteger(amount) || amount < 0) {
      errors.push(`Amount for “${tier.title.trim() === '' ? 'untitled tier' : tier.title.trim()}” must be 0 or more.`)
    }
    if (!/^[A-Z]{3}$/.test(tier.currency.trim().toUpperCase())) {
      errors.push('Currency must be a 3-letter code.')
    }
  }
  return errors
}

export function validatePrizes(
  data: Pick<WizardData, 'tiers' | 'participationCertificate' | 'acknowledged'>,
): string[] {
  const errors: string[] = []
  // Prizes are optional: an event may run with no prize tiers at all.
  for (const tier of data.tiers) errors.push(...validateTier(tier))
  if (!data.acknowledged) {
    errors.push('Confirm you understand prizes and certificate settings lock once the event goes live.')
  }
  return errors
}

// Prefill source for the edit page: flattened server rows (ISO date
// strings) for an existing DRAFT event plus its tracks and prizes.
export interface EventEditSource {
  event: {
    id: string
    slug: string
    title: string
    logoUrl: string | null
    bannerUrl: string | null
    cardBannerUrl: string | null
    websiteUrl: string | null
    format: string
    locationName: string | null
    locationAddress: string | null
    mapsUrl: string | null
    descriptionHtml: string | null
    registrationEnd: string | null
    submissionStart: string | null
    submissionDeadline: string | null
    judgingStart: string | null
    judgingEndTime: string | null
    publicVotingStart: string | null
    publicVotingEndTime: string | null
    announcementDate: string | null
    participationType: string
    minTeamSize: number
    maxTeamSize: number
    audience: string
    participationCertificate: boolean
  }
  tracks: Array<{ id: string; name: string; description: string | null }>
  prizes: Array<{
    id: string
    title: string
    kind: string
    cashValue: number
    currency: string
    trackId: string | null
  }>
}

// Flattens server rows into wizard state for editing. Track/tier ids are
// preserved so saves PATCH instead of duplicating; acknowledged restarts
// false so each edit session explicitly re-confirms the prize lock.
export function wizardFromEvent(source: EventEditSource): WizardData {
  const { event } = source
  return {
    eventId: event.id,
    slug: event.slug,
    title: event.title,
    logoUrl: event.logoUrl,
    bannerUrl: event.bannerUrl,
    cardBannerUrl: event.cardBannerUrl,
    websiteUrl: event.websiteUrl ?? '',
    format: event.format as WizardFormat,
    locationName: event.locationName ?? '',
    locationAddress: event.locationAddress ?? '',
    mapsUrl: event.mapsUrl ?? '',
    descriptionHtml: event.descriptionHtml ?? '',
    registrationEnd: event.registrationEnd,
    submissionStart: event.submissionStart,
    submissionDeadline: event.submissionDeadline,
    judgingStart: event.judgingStart,
    judgingEndTime: event.judgingEndTime,
    votingEnabled: event.publicVotingStart != null || event.publicVotingEndTime != null,
    publicVotingStart: event.publicVotingStart,
    publicVotingEndTime: event.publicVotingEndTime,
    announcementDate: event.announcementDate,
    participationType: event.participationType as WizardParticipation,
    minTeamSize: event.minTeamSize,
    maxTeamSize: event.maxTeamSize,
    audience: event.audience as WizardAudience,
    tracks: source.tracks.map((track) => ({
      key: `track-${track.id}`,
      id: track.id,
      name: track.name,
      description: track.description ?? '',
    })),
    tiers: source.prizes.map((prize) => ({
      key: `tier-${prize.id}`,
      id: prize.id,
      title: prize.title,
      kind: prize.kind as PrizeKind,
      amount: String(prize.cashValue),
      currency: prize.currency,
      trackId: prize.trackId ?? '',
    })),
    participationCertificate: event.participationCertificate,
    acknowledged: false,
  }
}

// Payload for a step save: only the fields that step owns, with blanks as
// null so the API clears them. Voting dates are dropped when voting is off.
export function timelinePayload(data: TimelineSlice): Record<string, string | null> {
  const pick = (key: (typeof TIMELINE_CHAIN)[number]): string | null => {
    if (!data.votingEnabled && (key === 'publicVotingStart' || key === 'publicVotingEndTime')) {
      return null
    }
    return data[key]
  }
  return Object.fromEntries(TIMELINE_CHAIN.map((key) => [key, pick(key)]))
}
