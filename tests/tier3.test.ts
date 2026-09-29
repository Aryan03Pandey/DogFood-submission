import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_COMMENT_BODY, sanitizeCommentText } from '../lib/comment-text'

const root = join(__dirname, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('tier-3 comments', () => {
  it('defines the comments table with moderation fields', () => {
    const schema = read('src/db/schema.ts')
    expect(schema).toMatch(/submissionComments/)
    expect(schema).toMatch(/submission_comments/)
    expect(schema).toMatch(/is_hidden/)
  })

  it('ships list, post, and hide through service, routes, and client', () => {
    const service = read('src/server/comment-service.ts')
    expect(service).toMatch(/export async function listComments/)
    expect(service).toMatch(/export async function postComment/)
    expect(service).toMatch(/export async function hideComment/)
    expect(service).toMatch(/COMMENT_POSTED/)
    expect(service).toMatch(/COMMENT_HIDDEN/)
    const route = read('app/api/events/[id]/submissions/[submissionId]/comments/route.ts')
    expect(route).toMatch(/export async function GET/)
    expect(route).toMatch(/export async function POST/)
    expect(route).toMatch(/export async function DELETE/)
    const client = read('lib/api-client.ts')
    expect(client).toMatch(/apiListComments/)
    expect(client).toMatch(/apiPostComment/)
    expect(client).toMatch(/apiHideComment/)
    const ui = read('components/event-page/submission-comments.tsx')
    expect(ui).toMatch(/Discussion/)
    expect(ui).toMatch(/Sign in to join the discussion/)
    // Comment input sits above the thread: comments render below the field.
    expect(ui.indexOf('<form')).toBeLessThan(ui.indexOf('comments.map'))
  })

  it('sanitizes the draft client-side before the API call', () => {
    const ui = read('components/event-page/submission-comments.tsx')
    expect(ui).toMatch(/sanitizeCommentText\(draft\)/)
    expect(ui).toMatch(/apiPostComment\(eventId, submissionId, clean\)/)
    expect(ui).toMatch(/maxLength=\{MAX_COMMENT_BODY\}/)
  })
})

describe('tier-3 comment text policy', () => {
  it('caps comment bodies at 2000 characters', () => {
    expect(MAX_COMMENT_BODY).toBe(2000)
  })

  it('strips markup but keeps the inner text', () => {
    expect(sanitizeCommentText('Hello <b>world</b>')).toBe('Hello world')
    expect(sanitizeCommentText('<script>alert(1)</script>hi')).toBe('alert(1)hi')
    expect(sanitizeCommentText('<img src=x onerror=alert(1)>pic')).toBe('pic')
  })

  it('trims whitespace and drops control characters', () => {
    expect(sanitizeCommentText('  padded  ')).toBe('padded')
    expect(sanitizeCommentText(`a${String.fromCharCode(1)}b`)).toBe('ab')
    expect(sanitizeCommentText(`a${String.fromCharCode(31)}b`)).toBe('ab')
    expect(sanitizeCommentText('line one\nline two')).toBe('line one\nline two')
  })

  it('truncates over-long input to the cap instead of passing it through', () => {
    const long = sanitizeCommentText('x'.repeat(MAX_COMMENT_BODY + 500))
    expect(long).toHaveLength(MAX_COMMENT_BODY)
  })

  it('enforces the same cap in the route schema and the comment service', () => {
    expect(read('src/lib/api/schemas.ts')).toMatch(/\.max\(MAX_COMMENT_BODY\)/)
    expect(read('src/server/comment-service.ts')).toMatch(/sanitizeCommentText\(body\)/)
  })
})

describe('tier-3 voting surfaces', () => {
  it('links the event page vote button to the dedicated voting page, not a tab', () => {
    const page = read('app/hackathons/[slug]/page.tsx')
    expect(page).toMatch(/Vote for this Event/)
    expect(page).toMatch(/hackathons\/\$\{event\.slug\}\/vote/)
    const tabs = read('components/event-page/event-tabs.tsx')
    expect(tabs).not.toMatch(/voting/)
    expect(tabs).not.toMatch(/CommunityVotingSection/)
    expect(read('app/hackathons/[slug]/vote/page.tsx')).toMatch(/VotingBoothPage/)
  })

  it('expands voting items to details plus discussion on the dedicated page', () => {
    const booth = read('components/event-page/voting-booth-page.tsx')
    expect(booth).toMatch(/Upvote this project/)
    expect(booth).toMatch(/SubmissionComments/)
    expect(booth).not.toMatch(/Submit Ballot/)
  })

  it('shows voters the same detail body judges see: stack, links, gallery, video', () => {
    const service = read('src/server/voting-service.ts')
    expect(service).toMatch(/techStack: submissions\.techStack/)
    expect(service).toMatch(/assetKeys: submissions\.assetKeys/)
    const booth = read('components/event-page/voting-booth-page.tsx')
    expect(booth).toMatch(/Stack:/)
    expect(booth).toMatch(/<SubmissionAssets/)
    expect(booth).toMatch(/SubmissionComments/)
    const assets = read('components/submission/submission-assets.tsx')
    expect(assets).toMatch(/role="dialog"/)
    expect(assets).toMatch(/<video/)
    const page = read('app/hackathons/[slug]/vote/page.tsx')
    expect(page).toMatch(/assetBase=\{filerBase\}/)
    expect(page).toMatch(/bucket=\{bucket\}/)
  })

  it('fits the project list in the viewport minus navbar, action bar, and 4rem', () => {
    const booth = read('components/event-page/voting-booth-page.tsx')
    expect(booth).toMatch(/actionBarRef/)
    expect(booth).toMatch(/window\.innerHeight - navbarHeight - actionBarHeight - 64/)
    expect(booth).toMatch(/ResizeObserver/)
    expect(booth).toMatch(/maxHeight: listMaxHeight/)
  })

  it('registers the admin voting tab with analytics', () => {
    expect(read('components/console/dashboard/tabs.ts')).toMatch(/id: 'voting'/)
    const service = read('src/server/voting-service.ts')
    expect(service).toMatch(/export async function getVotingAnalytics/)
    const panel = read('components/console/dashboard/voting-panel.tsx')
    expect(panel).toMatch(/Leaderboard/)
    expect(panel).toMatch(/Vote distribution/)
    expect(panel).toMatch(/Page \{safePage \+ 1\} of \{pageCount\}/)
  })

  it('shows duplicates inside the submissions tab', () => {
    const panel = read('components/console/dashboard/submissions-panel.tsx')
    expect(panel).toMatch(/Check duplicates/)
    expect(panel).toMatch(/Potential duplicates/)
    expect(read('lib/api-client.ts')).toMatch(/apiDetectDuplicates/)
  })
})

describe('tier-3 voting sample data', () => {
  it('rebuilds a voting-phase event with ballots, comments, and a duplicate pair', () => {
    const seed = read('scripts/seed-judging-sample.ts')
    expect(seed).toMatch(/resetEvent\('Event-test-3'\)/)
    expect(seed).toMatch(/publicVotingEndTime: new Date\(Date\.now\(\) \+ 6 \* DAY\)/)
    expect(seed).toMatch(/votingType: 'SINGLE_CHOICE'/)
    expect(seed).toMatch(/castVote\(actor, voteEvent\.id, `e3-seed-fp-\$\{k\}`/)
    expect(seed).toMatch(/postComment\(author, voteSubIds\[s\]/)
    expect(seed).toMatch(/habit tracker/)
  })
})

describe('tier-3 leaderboard screen', () => {
  it('links booth and tab to a paginated leaderboard with throttled refresh', () => {
    const board = read('components/event-page/voting-leaderboard.tsx')
    expect(board).toMatch(/Page \{safePage \+ 1\} of \{pageCount\}/)
    expect(board).toMatch(/REFRESH_COOLDOWN_MS/)
    expect(board).toMatch(/setInterval/)
    expect(board).not.toMatch(/poll/i)
    const page = read('app/hackathons/[slug]/vote/leaderboard/page.tsx')
    expect(page).toMatch(/VotingLeaderboard/)
    expect(page).toMatch(/PUBLIC_VOTING/)
    const booth = read('components/event-page/voting-booth-page.tsx')
    expect(booth).toMatch(/View leaderboard/)
    expect(booth).toMatch(/vote\/leaderboard/)
  })

  it('rate-limits leaderboard refreshes but not upvote toggles', () => {
    const vote = read('app/api/events/[id]/vote/route.ts')
    expect(vote).not.toMatch(/checkRateLimit/)
    const votes = read('app/api/events/[id]/votes/route.ts')
    expect(votes).toMatch(/checkRateLimit\(`leaderboard:/)
  })

  it('persists the refresh cooldown across reloads and revisits', () => {
    const board = read('components/event-page/voting-leaderboard.tsx')
    expect(board).toMatch(/leaderboard-refresh-cooldown/)
    expect(board).toMatch(/localStorage\.getItem\(storageKey\)/)
    expect(board).toMatch(/localStorage\.setItem\(storageKey/)
  })

  it('renders hydration-safe HTML: no browser reads in state initializers', () => {
    const board = read('components/event-page/voting-leaderboard.tsx')
    expect(board).not.toMatch(/typeof window === 'undefined'/)
    expect(board).not.toMatch(/useState\(\(\) => Date\.now\(\)\)/)
    // Rehydration happens after mount, never during render.
    expect(board.indexOf('localStorage.getItem')).toBeGreaterThan(board.indexOf('useEffect'))
  })
})

describe('tier-3 audit coverage', () => {
  it('logs score clears, flags, and assignment runs', () => {
    const service = read('src/server/judging-service.ts')
    expect(service).toMatch(/SCORE_CLEARED/)
    expect(service).toMatch(/FLAG_ADDED/)
    expect(service).toMatch(/FLAG_CLEARED/)
    expect(read('src/server/assignment-service.ts')).toMatch(/ASSIGNMENTS_GENERATED/)
  })
})
