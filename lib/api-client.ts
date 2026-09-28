// Frontend API controllers for authentication.
//
// Components must not call fetch() directly: every auth request from the
// browser goes through these functions, so endpoint URLs, methods, payload
// shapes, and error normalization live in exactly one place.

export interface SessionPayload {
  user: {
    id: string
    email: string
    name: string | null
    role: string
    organization: string | null
    createdAt: string
  }
  expiresAt: string
}

export interface ValidationDetails {
  formErrors?: string[]
  fieldErrors?: Record<string, string[] | undefined>
}

export class ApiError extends Error {
  status: number
  code: string
  details?: ValidationDetails
  constructor(code: string, status: number, details?: ValidationDetails) {
    super(code)
    this.code = code
    this.status = status
    this.details = details
  }
}

// Turns a VALIDATION_ERROR's zod-flattened details into a readable sentence
// ("slug: Slug must be lowercase …; submissionDeadline must not be before
// submissionStart"). Returns null when there is nothing specific to say, so
// callers fall back to their generic message.
export function validationDetailsMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return null
  const parts: string[] = []
  for (const [field, messages] of Object.entries(error.details?.fieldErrors ?? {})) {
    for (const message of messages ?? []) parts.push(`${field}: ${message}`)
  }
  for (const message of error.details?.formErrors ?? []) parts.push(message)
  return parts.length > 0 ? parts.join('; ') : null
}

function errorDetails(data: unknown): ValidationDetails | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const details = (data as { details?: unknown }).details
  return typeof details === 'object' && details !== null
    ? (details as ValidationDetails)
    : undefined
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    throw new ApiError('NETWORK_ERROR', 0)
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(
      typeof data?.error === 'string' ? data.error : 'REQUEST_FAILED',
      response.status,
      errorDetails(data),
    )
  }
  return data as T
}

function jsonBody(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

export function apiLogin(email: string, password: string): Promise<SessionPayload> {
  return request<SessionPayload>('/api/auth/login', jsonBody({ email, password }))
}

export interface RegisteredUserPayload {
  id: string
  email: string
  name: string | null
  role: string
  organization: string | null
  createdAt: string
}

export function apiRegister(email: string, password: string): Promise<RegisteredUserPayload> {
  return request<RegisteredUserPayload>('/api/auth/register', jsonBody({ email, password }))
}

export function apiLogout(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
}

export function apiFetchSession(): Promise<SessionPayload> {
  return request<SessionPayload>('/api/auth/me')
}

export function apiImpersonate(email: string): Promise<SessionPayload> {
  return request<SessionPayload>('/api/auth/impersonate', jsonBody({ email }))
}

// Organizer event management --------------------------------------------------
//
// Same rule as auth above: components call these helpers, never fetch()
// directly, so endpoint URLs and error normalization stay centralized.

export interface EventPayload {
  id: string
  title: string
  slug: string
  status: string
  registrationEnd: string | null
  submissionStart: string | null
  submissionDeadline: string | null
  judgingStart: string | null
  judgingEndTime: string | null
  publicVotingStart: string | null
  publicVotingEndTime: string | null
  announcementDate: string | null
  logoUrl: string | null
  bannerUrl: string | null
  cardBannerUrl: string | null
  websiteUrl: string | null
  descriptionHtml: string | null
  format: 'ONLINE' | 'OFFLINE' | 'HYBRID'
  locationName: string | null
  locationAddress: string | null
  mapsUrl: string | null
  participationType: 'INDIVIDUAL' | 'TEAM'
  minTeamSize: number
  maxTeamSize: number
  audience: 'STUDENT' | 'PROFESSIONAL' | 'OPEN'
  participationCertificate: boolean
  judgesPerSubmission?: number
  doubleBlindJudging?: boolean
  assignmentAlgorithm?: 'ROUND_ROBIN' | 'K_COVER'
  normalization?: 'RAW_MEAN' | 'Z_SCORE' | 'MIN_MAX' | 'TRIMMED_MEAN'
  createdAt: string
}

export interface TrackPayload {
  id: string
  eventId: string
  name: string
  description: string | null
  eligibilityRules: Record<string, unknown>
}

export interface PrizePayload {
  id: string
  eventId: string
  trackId: string | null
  title: string
  cashValue: number
  kind: 'MONETARY' | 'IN_KIND' | 'CERTIFICATE'
  currency: string
}

export interface EligibilityInput {
  maxTeamSize?: number
  studentOnly?: boolean
  requiredTech?: string[]
}

export interface EventInput {
  title: string
  slug?: string
  registrationEnd?: string | null
  submissionStart?: string | null
  submissionDeadline?: string | null
  judgingStart?: string | null
  judgingEndTime?: string | null
  publicVotingStart?: string | null
  publicVotingEndTime?: string | null
  announcementDate?: string | null
  logoUrl?: string | null
  bannerUrl?: string | null
  cardBannerUrl?: string | null
  websiteUrl?: string | null
  descriptionHtml?: string | null
  format?: 'ONLINE' | 'OFFLINE' | 'HYBRID'
  locationName?: string | null
  locationAddress?: string | null
  mapsUrl?: string | null
  participationType?: 'INDIVIDUAL' | 'TEAM'
  minTeamSize?: number
  maxTeamSize?: number
  audience?: 'STUDENT' | 'PROFESSIONAL' | 'OPEN'
  participationCertificate?: boolean
  judgesPerSubmission?: number
  doubleBlindJudging?: boolean
  assignmentAlgorithm?: 'ROUND_ROBIN' | 'K_COVER'
  normalization?: 'RAW_MEAN' | 'Z_SCORE' | 'MIN_MAX' | 'TRIMMED_MEAN'
}

function apiWrite<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  return request<T>(
    path,
    body === undefined
      ? { method }
      : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  )
}

export function apiListEvents(): Promise<{ events: EventPayload[] }> {
  return request<{ events: EventPayload[] }>('/api/events')
}

export function apiCreateEvent(input: EventInput): Promise<EventPayload> {
  return apiWrite<EventPayload>('/api/events', 'POST', input)
}

export function apiUpdateEvent(eventId: string, input: Partial<EventInput>): Promise<EventPayload> {
  return apiWrite<EventPayload>(`/api/events/${eventId}`, 'PATCH', input)
}

export function apiCreateTrack(
  eventId: string,
  input: { name: string; description?: string | null; eligibilityRules?: Record<string, unknown> },
): Promise<TrackPayload> {
  return apiWrite<TrackPayload>(`/api/events/${eventId}/tracks`, 'POST', input)
}

export function apiUpdateTrack(
  eventId: string,
  trackId: string,
  input: { name?: string; description?: string | null; eligibilityRules?: Record<string, unknown> },
): Promise<TrackPayload> {
  return apiWrite<TrackPayload>(`/api/events/${eventId}/tracks/${trackId}`, 'PATCH', input)
}

export function apiDeleteTrack(eventId: string, trackId: string): Promise<{ ok: boolean }> {
  return apiWrite<{ ok: boolean }>(`/api/events/${eventId}/tracks/${trackId}`, 'DELETE')
}

export interface PrizeInput {
  title: string
  trackId?: string | null
  cashValue: number
  kind?: 'MONETARY' | 'IN_KIND' | 'CERTIFICATE'
  currency?: string
}

export function apiCreatePrize(eventId: string, input: PrizeInput): Promise<PrizePayload> {
  return apiWrite<PrizePayload>(`/api/events/${eventId}/prizes`, 'POST', input)
}

export function apiUpdatePrize(
  eventId: string,
  prizeId: string,
  input: Partial<PrizeInput>,
): Promise<PrizePayload> {
  return apiWrite<PrizePayload>(`/api/events/${eventId}/prizes/${prizeId}`, 'PATCH', input)
}

export function apiDeletePrize(eventId: string, prizeId: string): Promise<{ ok: boolean }> {
  return apiWrite<{ ok: boolean }>(`/api/events/${eventId}/prizes/${prizeId}`, 'DELETE')
}

// Admin dashboard (ADMIN-DASHBOARD.md) ----------------------------------------

export interface DashboardOverviewPayload {
  eventId: string
  status: string
  totalParticipants: number
  totalSubmissions: number
  finalSubmissions: number
  reviewedSubmissions: number
  totalVotes: number
  activity: Array<{ date: string; count: number }>
}

export interface DashboardParticipantPayload {
  userId: string
  email: string
  name: string | null
  organization: string | null
  teamName: string | null
  memberRole: string | null
  registeredAt: string
}

export interface DashboardSubmissionPayload {
  id: string
  title: string
  teamName: string
  trackName: string
  status: 'draft' | 'final'
  isHidden: boolean
  repoUrl: string | null
  demoUrl: string | null
  submittedAt: string | null
  updatedAt: string
}

export interface DashboardGalleryItemPayload {
  id: string
  title: string
  teamName: string
  trackName: string
  isHidden: boolean
  submittedAt: string | null
}

export interface EventRolePayload {
  id: string
  eventId: string
  userId: string
  role: string
  createdAt: string
}

export function apiGetDashboard(eventId: string): Promise<DashboardOverviewPayload> {
  return request<DashboardOverviewPayload>(`/api/events/${eventId}/dashboard`)
}

export function apiListDashboardParticipants(eventId: string): Promise<{ participants: DashboardParticipantPayload[] }> {
  return request<{ participants: DashboardParticipantPayload[] }>(`/api/events/${eventId}/participants`)
}

export interface SubmissionListParams {
  page?: number
  pageSize?: number
  query?: string
  status?: 'draft' | 'final'
  track?: string
}

export interface SubmissionListResult {
  submissions: DashboardSubmissionPayload[]
  total: number
  page: number
  pageSize: number
  tracks: string[]
}

export function apiListDashboardSubmissions(
  eventId: string,
  params: SubmissionListParams = {},
): Promise<SubmissionListResult> {
  const search = new URLSearchParams()
  if (params.page !== undefined) search.set('page', String(params.page))
  if (params.pageSize !== undefined) search.set('pageSize', String(params.pageSize))
  if (params.query !== undefined && params.query !== '') search.set('query', params.query)
  if (params.status !== undefined) search.set('status', params.status)
  if (params.track !== undefined && params.track !== '') search.set('track', params.track)
  const suffix = search.size > 0 ? `?${search.toString()}` : ''
  return request<SubmissionListResult>(`/api/events/${eventId}/submissions${suffix}`)
}

export function apiListDashboardGallery(eventId: string): Promise<{ items: DashboardGalleryItemPayload[] }> {
  return request<{ items: DashboardGalleryItemPayload[] }>(`/api/events/${eventId}/gallery-items`)
}

export function apiSetSubmissionHidden(
  eventId: string,
  submissionId: string,
  isHidden: boolean,
): Promise<DashboardSubmissionPayload> {
  return apiWrite<DashboardSubmissionPayload>(
    `/api/events/${eventId}/submissions/${submissionId}`,
    'PATCH',
    { isHidden },
  )
}

export function apiPublishEvent(eventId: string, password: string): Promise<EventPayload> {
  return apiWrite<EventPayload>(`/api/events/${eventId}/publish`, 'POST', { password })
}

export function apiDeleteEvent(
  eventId: string,
  password: string,
): Promise<{ eventId: string; deleted: boolean }> {
  return apiWrite<{ eventId: string; deleted: boolean }>(`/api/events/${eventId}`, 'DELETE', {
    password,
  })
}

export function apiListEventRoles(eventId: string): Promise<{ eventId: string; roles: EventRolePayload[] }> {
  return request<{ eventId: string; roles: EventRolePayload[] }>(`/api/events/${eventId}/roles`)
}

export function apiAssignEventRole(
  eventId: string,
  input: { userId: string; role: 'ORGANIZER' | 'JUDGE' | 'PARTICIPANT' },
): Promise<EventRolePayload> {
  return apiWrite<EventRolePayload>(`/api/events/${eventId}/roles`, 'POST', input)
}

export function apiRemoveEventRole(eventId: string, userId: string): Promise<{ ok: boolean }> {
  return apiWrite<{ ok: boolean }>(`/api/events/${eventId}/roles`, 'DELETE', { userId })
}

export function apiLookupUser(email: string): Promise<{ users: Array<{ id: string; email: string; name: string | null }> }> {
  return request<{ users: Array<{ id: string; email: string; name: string | null }> }>(
    `/api/users?email=${encodeURIComponent(email)}`,
  )
}

export interface ProfileProjectPayload {
  id: string
  title: string
  description: string | null
  repoUrl: string | null
  hostedUrl: string | null
}

export interface ProfilePayload {
  user: {
    id: string
    email: string
    name: string | null
    firstName: string | null
    lastName: string | null
    countryCode: string | null
    phoneNumber: string | null
    profession: 'STUDENT' | 'PROFESSIONAL' | null
    country: string | null
    skills: string[]
    linkedinUrl: string | null
    githubUrl: string | null
    profileComplete: boolean
  }
  projects: ProfileProjectPayload[]
}

export interface UpdateProfileInput {
  firstName?: string | null
  lastName?: string | null
  countryCode?: string | null
  phoneNumber?: string | null
  profession?: 'STUDENT' | 'PROFESSIONAL' | null
  country?: string | null
  skills?: string[] | null
  linkedinUrl?: string | null
  githubUrl?: string | null
  projects?: Array<{
    title: string
    description?: string | null
    repoUrl?: string | null
    hostedUrl?: string | null
  }> | null
}

export function apiGetProfile(): Promise<ProfilePayload> {
  return request<ProfilePayload>('/api/profile')
}

export function apiUpdateProfile(input: UpdateProfileInput): Promise<ProfilePayload> {
  return apiWrite<ProfilePayload>('/api/profile', 'PATCH', input)
}

export interface TeamMemberPayload {
  userId: string
  name: string | null
  email: string
  role: 'LEADER' | 'MEMBER'
  joinedAt: string
  isSelf: boolean
}

export interface TeamSummaryPayload {
  team: {
    id: string
    eventId: string
    name: string
    inviteExpiresAt: string | null
    isLocked: boolean
  }
  members: TeamMemberPayload[]
  minTeamSize: number
  maxTeamSize: number
  frozen: boolean
  inviteExpired: boolean
  isLeader: boolean
}

export function apiGetMyTeam(eventId: string): Promise<{ team: TeamSummaryPayload | null }> {
  return request<{ team: TeamSummaryPayload | null }>(`/api/events/${eventId}/teams`)
}

export function apiCreateTeam(
  eventId: string,
  name: string,
): Promise<{ team: TeamSummaryPayload; token: string }> {
  return apiWrite<{ team: TeamSummaryPayload; token: string }>(
    `/api/events/${eventId}/teams`,
    'POST',
    { name },
  )
}

export function apiRenameTeam(eventId: string, teamId: string, name: string): Promise<{ team: TeamSummaryPayload }> {
  return apiWrite<{ team: TeamSummaryPayload }>(`/api/events/${eventId}/teams/${teamId}`, 'PATCH', {
    name,
  })
}

export function apiDeleteTeam(
  eventId: string,
  teamId: string,
  password: string,
): Promise<{ teamId: string; deleted: boolean }> {
  return apiWrite<{ teamId: string; deleted: boolean }>(
    `/api/events/${eventId}/teams/${teamId}`,
    'DELETE',
    { password },
  )
}

export function apiRotateInviteToken(
  eventId: string,
  teamId: string,
): Promise<{ token: string; expiresAt: string }> {
  return apiWrite<{ token: string; expiresAt: string }>(
    `/api/events/${eventId}/teams/${teamId}/token`,
    'POST',
  )
}

export function apiSubmitTeam(
  eventId: string,
  teamId: string,
  password: string,
): Promise<{ team: TeamSummaryPayload }> {
  return apiWrite<{ team: TeamSummaryPayload }>(
    `/api/events/${eventId}/teams/${teamId}/submit`,
    'POST',
    { password },
  )
}

export function apiJoinTeam(eventId: string, token: string): Promise<{ team: TeamSummaryPayload }> {
  return apiWrite<{ team: TeamSummaryPayload }>(`/api/events/${eventId}/teams/join`, 'POST', {
    token,
  })
}

export function apiLeaveTeam(
  eventId: string,
  teamId: string,
): Promise<{ transferredTo: string | null; deleted: boolean }> {
  return apiWrite<{ transferredTo: string | null; deleted: boolean }>(
    `/api/events/${eventId}/teams/${teamId}/leave`,
    'POST',
  )
}

export function apiKickMember(
  eventId: string,
  teamId: string,
  userId: string,
): Promise<{ team: TeamSummaryPayload }> {
  return apiWrite<{ team: TeamSummaryPayload }>(
    `/api/events/${eventId}/teams/${teamId}/kick`,
    'POST',
    { userId },
  )
}

export function apiTransferLeadership(
  eventId: string,
  teamId: string,
  userId: string,
): Promise<{ team: TeamSummaryPayload }> {
  return apiWrite<{ team: TeamSummaryPayload }>(
    `/api/events/${eventId}/teams/${teamId}/transfer`,
    'POST',
    { userId },
  )
}

export function apiRegisterForEvent(eventId: string): Promise<{ eventId: string; registered: boolean; role: string }> {
  return apiWrite<{ eventId: string; registered: boolean; role: string }>(
    `/api/events/${eventId}/register`,
    'POST',
  )
}

export function apiUnregisterForEvent(
  eventId: string,
  password: string,
): Promise<{ eventId: string; registered: boolean }> {
  return apiWrite<{ eventId: string; registered: boolean }>(
    `/api/events/${eventId}/register`,
    'DELETE',
    { password },
  )
}

// Team submissions (SUBMISSIONS.md) --------------------------------------------------
//
// Same rule as auth above: components call these helpers, never fetch()
// directly. Draft reads/creates go through /mine and /; Save draft PATCHes
// with the updatedAt precondition; assets upload as multipart FormData.

export interface SubmissionAssetPayload {
  key: string
  name: string
  sizeBytes: number
  mime: string
}

export interface SubmissionSummaryPayload {
  id: string
  teamId: string
  eventId: string
  trackId: string | null
  trackName: string
  title: string
  tagline: string | null
  description: string | null
  techStack: string[]
  repoUrl: string | null
  demoUrl: string | null
  assets: SubmissionAssetPayload[]
  assetBytes: number
  status: 'draft' | 'final'
  submittedAt: string | null
  updatedAt: string
  isLeader: boolean
}

export interface SubmissionTrackPayload {
  id: string
  name: string
  description: string | null
}

export function apiGetMySubmission(eventId: string): Promise<{ submission: SubmissionSummaryPayload | null }> {
  return request<{ submission: SubmissionSummaryPayload | null }>(
    `/api/events/${eventId}/submissions/mine`,
  )
}

export function apiCreateSubmission(
  eventId: string,
  trackId?: string,
): Promise<{ submission: SubmissionSummaryPayload }> {
  return apiWrite<{ submission: SubmissionSummaryPayload }>(
    `/api/events/${eventId}/submissions`,
    'POST',
    trackId === undefined ? {} : { trackId },
  )
}

export function apiUpdateSubmission(
  eventId: string,
  submissionId: string,
  input: Partial<{
    title: string
    tagline: string | null
    description: string | null
    techStack: string[]
    trackId: string
    repoUrl: string | null
    demoUrl: string | null
  }> & { updatedAt: string },
): Promise<{ submission: SubmissionSummaryPayload }> {
  return apiWrite<{ submission: SubmissionSummaryPayload }>(
    `/api/events/${eventId}/submissions/${submissionId}`,
    'PATCH',
    input,
  )
}

export function apiDeleteSubmission(
  eventId: string,
  submissionId: string,
  password: string,
): Promise<{ submissionId: string; deleted: boolean }> {
  return apiWrite<{ submissionId: string; deleted: boolean }>(
    `/api/events/${eventId}/submissions/${submissionId}`,
    'DELETE',
    { password },
  )
}

export function apiRemoveSubmissionAsset(
  eventId: string,
  submissionId: string,
  key: string,
): Promise<{ submission: SubmissionSummaryPayload }> {
  return apiWrite<{ submission: SubmissionSummaryPayload }>(
    `/api/events/${eventId}/submissions/${submissionId}/assets`,
    'DELETE',
    { key },
  )
}

export async function apiUploadSubmissionAsset(
  eventId: string,
  submissionId: string,
  file: File,
): Promise<{ submission: SubmissionSummaryPayload; usedBytes: number; totalBytes: number }> {
  const form = new FormData()
  form.append('file', file, file.name)
  // eslint-disable-next-line no-console
  console.log('[asset-upload] POST assets:', file.name, `${file.size}B`, file.type)
  let response: Response
  try {
    response = await fetch(`/api/events/${eventId}/submissions/${submissionId}/assets`, {
      method: 'POST',
      body: form,
    })
  } catch {
    throw new ApiError('NETWORK_ERROR', 0)
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(
      typeof data?.error === 'string' ? data.error : 'REQUEST_FAILED',
      response.status,
    )
  }
  return data as { submission: SubmissionSummaryPayload; usedBytes: number; totalBytes: number }
}

export function apiFinalizeSubmission(
  eventId: string,
  submissionId: string,
  password: string,
): Promise<{ submissionId: string; submitted: boolean }> {
  return apiWrite<{ submissionId: string; submitted: boolean }>(
    `/api/events/${eventId}/submissions/${submissionId}/submit`,
    'POST',
    { password },
  )
}

export function apiSetGlobalRole(
  userId: string,
  role: 'SUPERADMIN' | 'ORGANIZER' | 'JUDGE' | 'PARTICIPANT',
): Promise<{ id: string; role: string }> {
  return apiWrite<{ id: string; role: string }>('/api/users', 'PATCH', { userId, role })
}

// Judging (JUDGING-FEATURE.md) -------------------------------------------------
//
// Organizer judging tools and the judge dashboard call these helpers, never
// fetch() directly.

export interface JudgeCandidatePayload {
  id: string
  name: string | null
  email: string
  organization: string | null
  eventRole: 'ORGANIZER' | 'JUDGE' | 'PARTICIPANT' | null
}

export interface RubricCriterionPayload {
  id: string
  label: string
  weight: number
  minScore: number
  maxScore: number
  kind?: 'int' | 'float'
  step?: number
}

export interface RubricPayload {
  id: string
  eventId: string
  title: string
  criteriaJson: RubricCriterionPayload[]
}

export interface JudgeQueueItemPayload {
  assignmentId: string
  status: string
  scored: boolean
  flag: { id: string; reason: string } | null
  event: { id: string; title: string }
  submission: {
    id: string
    title: string
    tagline: string | null
    description: string | null
    techStack: string[]
    repoUrl: string | null
    demoUrl: string | null
  }
  track: { id: string; name: string }
  team?: { id: string; name: string }
}

export function apiListJudgeCandidates(
  eventId: string,
  query?: string,
): Promise<{ eventId: string; candidates: JudgeCandidatePayload[]; judges: EventJudgePayload[] }> {
  const suffix = query ? `&q=${encodeURIComponent(query)}` : ''
  return request<{ eventId: string; candidates: JudgeCandidatePayload[]; judges: EventJudgePayload[] }>(
    `/api/organizer/judges?eventId=${eventId}${suffix}`,
  )
}

export function apiInviteJudge(
  eventId: string,
  userId: string,
): Promise<{ id: string; role: string }> {
  return apiWrite<{ id: string; role: string }>('/api/organizer/judges', 'POST', {
    eventId,
    userId,
  })
}

export function apiRemoveJudge(
  eventId: string,
  userId: string,
  password: string,
): Promise<{ removed: boolean; orphaned: number; reassigned: number; unresolved: unknown[] }> {
  return apiWrite('/api/organizer/judges', 'DELETE', { eventId, userId, password })
}

export function apiListTracks(eventId: string): Promise<{ eventId: string; tracks: TrackPayload[] }> {
  return request<{ eventId: string; tracks: TrackPayload[] }>(`/api/events/${eventId}/tracks`)
}

export interface SubmissionCommentPayload {
  id: string
  authorName: string
  body: string
  createdAt: string
}

export function apiListComments(
  eventId: string,
  submissionId: string,
): Promise<{ comments: SubmissionCommentPayload[]; moderator: boolean }> {
  return request<{ comments: SubmissionCommentPayload[]; moderator: boolean }>(
    `/api/events/${eventId}/submissions/${submissionId}/comments`,
  )
}

export function apiPostComment(
  eventId: string,
  submissionId: string,
  body: string,
): Promise<{ comment: SubmissionCommentPayload }> {
  return apiWrite<{ comment: SubmissionCommentPayload }>(
    `/api/events/${eventId}/submissions/${submissionId}/comments`,
    'POST',
    { body },
  )
}

export function apiHideComment(
  eventId: string,
  submissionId: string,
  commentId: string,
): Promise<{ commentId: string; hidden: boolean }> {
  return apiWrite<{ commentId: string; hidden: boolean }>(
    `/api/events/${eventId}/submissions/${submissionId}/comments`,
    'DELETE',
    { commentId },
  )
}

export interface DuplicatePairPayload {
  submissionA: { id: string; title: string; teamName: string }
  submissionB: { id: string; title: string; teamName: string }
  similarityScore: number
}

export function apiDetectDuplicates(eventId: string): Promise<{ duplicates: DuplicatePairPayload[] }> {
  return request<{ duplicates: DuplicatePairPayload[] }>(`/api/events/${eventId}/duplicates`)
}

export function apiSetJudgeTracks(
  eventId: string,
  judgeId: string,
  trackIds: string[],
): Promise<{ judgeId: string; trackIds: string[] }> {
  return apiWrite(`/api/organizer/judges/${judgeId}/tracks`, 'POST', { eventId, trackIds })
}

export function apiSaveRubric(input: {
  eventId: string
  id?: string
  title: string
  criteriaJson: RubricCriterionPayload[]
}): Promise<RubricPayload> {
  return apiWrite<RubricPayload>('/api/organizer/rubrics', 'POST', input)
}

export function apiGenerateAssignments(
  eventId: string,
  trackId?: string,
): Promise<{ assignmentsCreated: number; unresolved: unknown[] }> {
  return apiWrite('/api/organizer/assignments/generate', 'POST', { eventId, trackId })
}

export interface EventJudgePayload {
  id: string
  name: string | null
  email: string
  organization: string | null
  tracks: Array<{ judgeId: string; trackId: string; trackName: string }>
}

export function apiGetEventJudges(eventId: string): Promise<{ judges: EventJudgePayload[] }> {
  return request(`/api/organizer/judges?eventId=${eventId}`)
}

export function apiAssignmentProgress(eventId: string): Promise<{
  judges: Array<{
    judgeId: string
    name: string | null
    email: string
    assigned: number
    completed: number
    pending: number
  }>
}> {
  return request(`/api/organizer/assignments/progress?eventId=${eventId}`)
}

export function apiRankings(eventId: string): Promise<{
  rankings: Array<{
    submissionId: string
    title: string
    teamName: string
    scoreCount: number
    raw: number
    zScore: number
    minMax: number
    trimmedMean: number
  }>
}> {
  return request(`/api/organizer/rankings?eventId=${eventId}`)
}

export function apiJudgeQueue(eventId?: string): Promise<{ assignments: JudgeQueueItemPayload[] }> {
  const suffix = eventId ? `?eventId=${eventId}` : ''
  return request(`/api/judge/queue${suffix}`)
}

export interface JudgeDetailPayload {
  assignmentId: string
  event: { id: string; title: string; doubleBlindJudging: boolean }
  submission: {
    id: string
    title: string
    tagline: string | null
    description: string | null
    techStack: string[]
    repoUrl: string | null
    demoUrl: string | null
    assetKeys: unknown
  }
  track: { id: string; name: string }
  rubric: { id: string; title: string; criteriaJson: RubricCriterionPayload[] } | null
  score: {
    rubricScoresJson: Record<string, number>
    comment: string | null
    submittedAt: string | null
  } | null
  flag: { id: string; reason: string; comment: string | null } | null
  team?: {
    id: string
    name: string
    members: Array<{ id: string; name: string | null; email: string; role: string }>
  }
}

export function apiJudgeSubmission(submissionId: string): Promise<JudgeDetailPayload> {
  return request<JudgeDetailPayload>(`/api/judge/submissions/${submissionId}`)
}

export function apiSaveJudgeScore(input: {
  assignmentId: string
  rubricScoresJson: Record<string, number>
  comment?: string
}): Promise<unknown> {
  return apiWrite('/api/judge/scores', 'POST', input)
}

export function apiClearJudgeScore(assignmentId: string): Promise<{ cleared: boolean }> {
  return apiWrite('/api/judge/scores', 'DELETE', { assignmentId })
}

export function apiFlagSubmission(input: {
  assignmentId: string
  reason: 'PLAGIARISM' | 'OFF_TOPIC' | 'INCOMPLETE' | 'INAPPROPRIATE' | 'OTHER'
  comment?: string
}): Promise<unknown> {
  return apiWrite('/api/judge/flags', 'POST', input)
}

export function apiUnflagSubmission(assignmentId: string): Promise<{ cleared: boolean }> {
  return apiWrite('/api/judge/flags', 'DELETE', { assignmentId })
}
