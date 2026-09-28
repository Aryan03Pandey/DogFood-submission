import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSubmissionSchema, updateSubmissionSchema } from '../../src/lib/api/schemas'
import {
  normalizeSubmissionAssets,
  SUBMISSION_ASSET_MIME,
  SUBMISSION_ASSET_TOTAL_BYTES,
  submissionAssetOverflow,
  submissionAssetsSize,
} from '../../src/lib/submissions'
import {
  apiCreateSubmission,
  apiDeleteSubmission,
  apiFinalizeSubmission,
  apiGetMySubmission,
  apiRemoveSubmissionAsset,
  apiUpdateSubmission,
  apiUploadSubmissionAsset,
} from '../../lib/api-client'

const root = join(__dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const TRACK = '123e4567-e89b-12d3-a456-426614174000'
const AT = '2026-05-20T12:00:00.000Z'

describe('submission request schemas', () => {
  it('creates drafts trackless with the track picked in the form', () => {
    expect(createSubmissionSchema.safeParse({ trackId: TRACK }).success).toBe(true)
    expect(createSubmissionSchema.safeParse({ trackId: 'nope' }).success).toBe(false)
    expect(createSubmissionSchema.safeParse({}).success).toBe(true)
  })

  it('bounds draft fields and enforces strict link formats', () => {
    const base = { updatedAt: AT }
    expect(updateSubmissionSchema.safeParse({ ...base, title: 'Glass Signal' }).success).toBe(true)
    expect(updateSubmissionSchema.safeParse({ ...base, title: '' }).success).toBe(false)
    expect(updateSubmissionSchema.safeParse({ ...base, tagline: 'x'.repeat(141) }).success).toBe(false)
    expect(updateSubmissionSchema.safeParse({ ...base, description: 'x'.repeat(501) }).success).toBe(false)
    expect(updateSubmissionSchema.safeParse({ ...base, repoUrl: 'github.com/x' }).success).toBe(false)
    expect(updateSubmissionSchema.safeParse({ ...base, repoUrl: 'https://github.com/x' }).success).toBe(true)
    expect(updateSubmissionSchema.safeParse({ ...base, repoUrl: '' }).success).toBe(true)
    expect(updateSubmissionSchema.safeParse({ ...base, repoUrl: null }).success).toBe(true)
    expect(updateSubmissionSchema.safeParse({ ...base, techStack: ['a'.repeat(41)] }).success).toBe(false)
    expect(updateSubmissionSchema.safeParse({ title: 'x' }).success).toBe(false)
    expect(updateSubmissionSchema.safeParse({ ...base, updatedAt: 'not-a-date' }).success).toBe(false)
  })
})

describe('submission asset budget', () => {
  it('caps only the total, never a single file', () => {
    expect(SUBMISSION_ASSET_TOTAL_BYTES).toBe(100 * 1024 * 1024)
    const oneBig = [{ key: 'k', name: 'demo.mp4', sizeBytes: SUBMISSION_ASSET_TOTAL_BYTES, mime: 'video/mp4' }]
    expect(submissionAssetOverflow([], SUBMISSION_ASSET_TOTAL_BYTES)).toBe(null)
    expect(submissionAssetOverflow(oneBig, 1)).toBe(1)
    expect(submissionAssetsSize(oneBig)).toBe(SUBMISSION_ASSET_TOTAL_BYTES)
  })

  it('accepts images, zips, PDFs, slides, and common video mimes', () => {
    expect(SUBMISSION_ASSET_MIME).toEqual(
      expect.arrayContaining([
        'image/png',
        'application/zip',
        'application/pdf',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'video/mp4',
        'video/webm',
      ]),
    )
    expect(SUBMISSION_ASSET_MIME).not.toContain('application/msword')
  })

  it('normalizes legacy plain-key rows to zero-size entries', () => {
    expect(normalizeSubmissionAssets([])).toEqual([])
    expect(normalizeSubmissionAssets(null)).toEqual([])
    expect(normalizeSubmissionAssets(['abc'])).toEqual([
      { key: 'abc', name: 'abc', sizeBytes: 0, mime: '' },
    ])
  })
})

describe('submission surface contract', () => {
  it('exposes mine, create, save-draft, asset, delete, and finalize routes', () => {
    expect(read('app/api/events/[id]/submissions/route.ts')).toMatch(/createDraft/)
    expect(read('app/api/events/[id]/submissions/mine/route.ts')).toMatch(/getMySubmission/)
    expect(read('app/api/events/[id]/submissions/[submissionId]/route.ts')).toMatch(/updateDraft/)
    expect(read('app/api/events/[id]/submissions/[submissionId]/route.ts')).toMatch(/deleteDraft/)
    expect(read('app/api/events/[id]/submissions/[submissionId]/assets/route.ts')).toMatch(/appendAsset/)
    expect(read('app/api/events/[id]/submissions/[submissionId]/submit/route.ts')).toMatch(/passwordConfirmSchema/)
  })

  it('locks writes to the submission window with stale-draft conflicts', () => {
    const service = read('src/server/submission-service.ts')
    expect(service).toMatch(/assertSubmissionWindow/)
    expect(service).toMatch(/SUBMISSION_CLOSED/)
    expect(service).toMatch(/SUBMISSION_NOT_OPEN/)
    expect(service).toMatch(/STALE_DRAFT/)
    expect(service).toMatch(/TEAM_REQUIRED/)
    expect(service).toMatch(/ASSET_BUDGET_EXCEEDED/)
  })

  it('keeps finalize and delete leader-only and password-confirmed', () => {
    const service = read('src/server/submission-service.ts')
    expect(service).toMatch(/role !== "LEADER"/)
    expect(read('src/server/team-service.ts')).toMatch(/membership\.role !== 'LEADER'/)
  })

  it('saves drafts only via Save draft or finalize, with staged assets', () => {
    const form = read('components/submission/submission-form.tsx')
    expect(form).not.toMatch(/AUTOSAVE_MS/)
    expect(form).not.toMatch(/useEffect/)
    expect(form).not.toMatch(/Pick a track to start your draft/)
    expect(form).toMatch(/STALE_DRAFT/)
    expect(form).toMatch(/apiUpdateSubmission/)
    expect(form).toMatch(/Confirm finalize/)
    expect(form).toMatch(/Delete draft/)
    expect(form).toMatch(/of \{formatBytes\(SUBMISSION_ASSET_TOTAL_BYTES\)\}/)
    expect(form).toMatch(/Start your draft/)
    expect(form).toMatch(/id="submission-track"/)
    expect(form).toMatch(/Select a track…/)
    expect(form).toMatch(/patchFields\(\{ trackId: event\.target\.value \}\)/)
    expect(form).toMatch(/async function saveNow\(\): Promise<boolean>/)
    expect(form).toMatch(/title: current\.title\.trim\(\) === '' \? undefined/)
    expect(form).toMatch(/Draft is already up to date\./)
    expect(form).toMatch(/Pending upload/)
    expect(form).toMatch(/const incoming = Array\.from\(files\)/)
    expect(form).not.toMatch(/Array\.from\(files!\)/)
    expect(form).toMatch(/Upload failed — retries on next save/)
    expect(form).toMatch(/Uploading \${uploadCount\.done} of \${uploadCount\.total}/)
    expect(form).toMatch(/Mark sent only on success/)
    expect(form).toMatch(/await saveNow\(\).*[\s\S]*apiFinalizeSubmission/)
    expect(form).toMatch(/async function dropAsset\(key: string\)/)
    expect(form).toMatch(/apiRemoveSubmissionAsset/)
    expect(form).toMatch(/Removing…/)
    expect(read('src/server/team-service.ts')).toMatch(/TRACK_REQUIRED/)
  })

  it('removes assets draft-only with a missing-key conflict', () => {
    const service = read('src/server/submission-service.ts')
    expect(service).toMatch(/export async function removeAsset\(/)
    expect(service).toMatch(/ASSET_NOT_FOUND/)
    expect(service).toMatch(/ALREADY_SUBMITTED/)
    const route = read('app/api/events/[id]/submissions/[submissionId]/assets/route.ts')
    expect(route).toMatch(/export async function DELETE\(/)
    expect(route).toMatch(/removeAssetSchema/)
  })
})

describe('submission api controllers', () => {
  function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => ({
        ok: true,
        status: 200,
        json: async () => handler(url, init),
      })),
    )
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads, creates, patches, deletes, removes assets, and finalizes through their endpoints', async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = []
    stubFetch((url, init) => {
      seen.push({ url, init })
      return url.endsWith('/mine') ? { submission: null } : { submission: { id: 's' } }
    })
    await apiGetMySubmission('e1')
    await apiCreateSubmission('e1', TRACK)
    await apiUpdateSubmission('e1', 's1', { title: 'T', updatedAt: AT })
    await apiDeleteSubmission('e1', 's1', 'pw')
    await apiRemoveSubmissionAsset('e1', 's1', 'k1')
    await apiFinalizeSubmission('e1', 's1', 'pw')
    expect(seen.map((entry) => `${entry.init?.method} ${entry.url}`)).toEqual([
      'undefined /api/events/e1/submissions/mine',
      'POST /api/events/e1/submissions',
      'PATCH /api/events/e1/submissions/s1',
      'DELETE /api/events/e1/submissions/s1',
      'DELETE /api/events/e1/submissions/s1/assets',
      'POST /api/events/e1/submissions/s1/submit',
    ])
    expect(JSON.parse(String(seen[3].init?.body))).toEqual({ password: 'pw' })
    expect(JSON.parse(String(seen[4].init?.body))).toEqual({ key: 'k1' })
  })

  it('uploads assets as multipart form data', async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = []
    stubFetch((url, init) => {
      seen.push({ url, init })
      return { submission: { id: 's' }, usedBytes: 10, totalBytes: SUBMISSION_ASSET_TOTAL_BYTES }
    })
    const file = new File(['x'.repeat(10)], 'demo.mp4', { type: 'video/mp4' })
    const result = await apiUploadSubmissionAsset('e1', 's1', file)
    expect(seen).toHaveLength(1)
    expect(seen[0].url).toBe('/api/events/e1/submissions/s1/assets')
    expect(seen[0].init?.method).toBe('POST')
    expect(result.usedBytes).toBe(10)
  })
})
