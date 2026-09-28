'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileUp, Lock, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  ApiError,
  apiCreateSubmission,
  apiDeleteSubmission,
  apiFinalizeSubmission,
  apiGetMySubmission,
  apiRemoveSubmissionAsset,
  apiUpdateSubmission,
  apiUploadSubmissionAsset,
  validationDetailsMessage,
  type SubmissionSummaryPayload,
  type SubmissionTrackPayload,
} from '@/lib/api-client'
import { SUBMISSION_ASSET_TOTAL_BYTES } from '@/src/lib/submissions'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return {}
  const out: Record<string, string> = {}
  for (const [field, messages] of Object.entries(error.details?.fieldErrors ?? {})) {
    const first = (messages ?? [])[0]
    if (first) out[field] = first
  }
  return out
}

function submitErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'STALE_DRAFT') return 'STALE_DRAFT'
    if (error.code === 'SUBMISSION_CLOSED') return 'Submissions are closed for this event.'
    if (error.code === 'SUBMISSION_NOT_OPEN') return 'Submissions are not open yet.'
    if (error.code === 'TEAM_REQUIRED') return 'Join or create a team before submitting.'
    if (error.code === 'TRACK_NOT_FOUND') return 'That track no longer exists. Pick another.'
    if (error.code === 'TRACK_REQUIRED') return 'Pick a track in the form before finalizing.'
    if (error.code === 'ASSET_NOT_FOUND') return 'That file was already removed.'
    if (error.code === 'ASSET_BUDGET_EXCEEDED') return 'That file would exceed the total asset budget.'
    if (error.code === 'UNSUPPORTED_TYPE') return 'That file type is not allowed (images, zips, PDFs, slides, MP4/WebM).'
    if (error.code === 'UPLOAD_FAILED') return 'Storage upload failed. Try again.'
    if (error.code === 'INVALID_CREDENTIALS') return 'Wrong password. Try again.'
    if (error.code === 'FORBIDDEN') return 'Only the leader can do that.'
    if (error.code === 'ALREADY_SUBMITTED') return 'This submission is already final.'
    if (error.code === 'VALIDATION_ERROR') {
      return validationDetailsMessage(error) ?? 'Check the highlighted fields and try again.'
    }
    if (error.code === 'NETWORK_ERROR') return 'Save failed. Is the server running?'
  }
  return 'Save failed. Try again.'
}

interface Fields {
  title: string
  tagline: string
  description: string
  techStack: string
  trackId: string
  repoUrl: string
  demoUrl: string
}

function fieldsFrom(summary: SubmissionSummaryPayload): Fields {
  return {
    title: summary.title === 'Untitled project' ? '' : summary.title,
    tagline: summary.tagline ?? '',
    description: summary.description ?? '',
    techStack: summary.techStack.join(', '),
    trackId: summary.trackId ?? '',
    repoUrl: summary.repoUrl ?? '',
    demoUrl: summary.demoUrl ?? '',
  }
}

// Team submission form (SUBMISSIONS.md): bare draft creation, then an
// explicitly saved draft — nothing (fields or asset bytes) reaches the server
// until Save draft or Finalize. The track is picked inside the form and is
// required to finalize. Drafts are editable by any member; finalize and
// delete are leader-only and password-confirmed. Final submissions render
// read-only.
export function SubmissionForm({
  eventId,
  slug,
  tracks,
  initial,
  submissionsOpen,
}: {
  eventId: string
  slug: string
  tracks: SubmissionTrackPayload[]
  initial: SubmissionSummaryPayload | null
  submissionsOpen: boolean
}) {
  const router = useRouter()
  const [saved, setSaved] = useState<SubmissionSummaryPayload | null>(initial)
  const [fields, setFields] = useState<Fields | null>(initial ? fieldsFrom(initial) : null)
  const [fieldHints, setFieldHints] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [working, setWorking] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [failedFiles, setFailedFiles] = useState<Set<File>>(new Set())
  const [uploadCount, setUploadCount] = useState<{ done: number; total: number } | null>(null)
  const [droppingKey, setDroppingKey] = useState<string | null>(null)
  const [closed, setClosed] = useState(!submissionsOpen)
  const [confirmingFinalize, setConfirmingFinalize] = useState(false)
  const [finalizePassword, setFinalizePassword] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const lastSent = useRef<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const draft = saved && saved.status === 'draft' ? saved : null
  const editable = draft !== null && !closed
  const isLeader = saved?.isLeader ?? false
  // Temporary debug: what actually committed (vs what the updater computed).
  if (pendingFiles.length > 0) {
    // eslint-disable-next-line no-console
    console.log('[asset-upload] render: committed pending =', JSON.stringify(pendingFiles.map((file) => file.name)))
  }

  function patchFields(patch: Partial<Fields>) {
    setFields((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  function buildSnapshot(current: Fields): string {
    return JSON.stringify({
      // Omit an untouched title: sending '' trips the required-title
      // validation and aborts the whole save (including staged uploads).
      title: current.title.trim() === '' ? undefined : current.title.trim(),
      tagline: current.tagline.trim(),
      description: current.description.trim(),
      techStack: current.techStack.split(',').map((entry) => entry.trim()).filter(Boolean),
      // Omit when no track is picked yet: the draft stays trackless and the
      // team chooses in the form; finalize requires one.
      trackId: current.trackId === '' ? undefined : current.trackId,
      repoUrl: current.repoUrl.trim() === '' ? null : current.repoUrl.trim(),
      demoUrl: current.demoUrl.trim() === '' ? null : current.demoUrl.trim(),
    })
  }

  // Shared PATCH path for autosave and the manual Save draft button. Returns
  // true when the server accepted the snapshot.
  async function persist(snapshot: string, submissionId: string, baseUpdatedAt: string): Promise<boolean> {
    // eslint-disable-next-line no-console
    console.log('[asset-upload] persist: PATCH submission', submissionId, 'baseUpdatedAt =', baseUpdatedAt, 'keys =', Object.keys(JSON.parse(snapshot)))
    setSaving(true)
    setFieldHints({})
    try {
      const parsed = JSON.parse(snapshot) as Omit<Fields, 'techStack'> & { techStack: string[] }
      const { submission } = await apiUpdateSubmission(eventId, submissionId, {
        ...parsed,
        updatedAt: baseUpdatedAt,
      })
      setSaved(submission)
      setNotice(null)
      return true
    } catch (err) {
      const message = submitErrorMessage(err)
      if (message === 'STALE_DRAFT') {
        const { submission } = await apiGetMySubmission(eventId).catch(() => ({ submission: null }))
        if (submission) {
          setSaved(submission)
          setNotice('A teammate saved newer changes — refreshed. Your text above is kept; press Save draft to retry.')
        }
      } else if (err instanceof ApiError && err.code === 'SUBMISSION_CLOSED') {
        setClosed(true)
        setError(message)
      } else if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        setFieldHints(fieldErrors(err))
        setError(message)
      } else {
        setError(message)
      }
      return false
    } finally {
      setSaving(false)
    }
  }

  // Explicit save: PATCH the fields, then upload staged files. Skips the
  // PATCH when nothing changed but still uploads newly staged files.
  // Returns true when everything was stored.
  async function saveNow(): Promise<boolean> {
    // eslint-disable-next-line no-console
    console.log('[asset-upload] saveNow: editable =', editable, ', hasFields =', fields !== null, ', savedId =', saved?.id ?? null, ', saving =', saving, ', uploading =', uploading, ', pendingFiles =', pendingFiles.map((file) => file.name))
    if (!editable || !fields || !saved || saving || uploading) return false
    const snapshot = buildSnapshot(fields)
    const fieldsDirty = snapshot !== lastSent.current
    if (!fieldsDirty && pendingFiles.length === 0) {
      setNotice('Draft is already up to date.')
      return true
    }
    // eslint-disable-next-line no-console
    console.log('[asset-upload] saveNow: fieldsDirty =', fieldsDirty, ', pendingCount =', pendingFiles.length)
    if (fieldsDirty) {
      const ok = await persist(snapshot, saved.id, saved.updatedAt)
      if (!ok) return false
      // Mark sent only on success: a failed save must stay retryable
      // instead of looking "already up to date" next time.
      lastSent.current = snapshot
    }
    if (pendingFiles.length > 0) {
      // eslint-disable-next-line no-console
      console.log('[asset-upload] saveNow: calling uploadPending with', pendingFiles.length, 'file(s)')
      const ok = await uploadPending(saved.id)
      // eslint-disable-next-line no-console
      console.log('[asset-upload] saveNow: uploadPending returned', ok)
      if (!ok) return false
    }
    setFailedFiles(new Set())
    setNotice('Draft saved.')
    return true
  }

  async function create() {
    if (working) return
    setWorking(true)
    setError(null)
    try {
      const { submission } = await apiCreateSubmission(eventId)
      lastSent.current = null
      setSaved(submission)
      setFields(fieldsFrom(submission))
      setNotice('Draft created. Press Save draft to store your changes.')
    } catch (err) {
      setError(submitErrorMessage(err))
    } finally {
      setWorking(false)
    }
  }

  // Files are only staged here; bytes reach seaweedfs when the team
  // presses Save draft or Finalize (uploadPending below).
  function stageFiles(files: FileList | null) {
    // eslint-disable-next-line no-console
    console.log('[asset-upload] stageFiles: editable =', editable, ', incoming =', files?.length ?? 0)
    if (!editable || !files || files.length === 0) {
      // eslint-disable-next-line no-console
      console.log('[asset-upload] stageFiles: IGNORED (editable =', editable, ')')
      return
    }
    // Snapshot the FileList EAGERLY. The updater below can (re-)run after
    // this handler finishes — StrictMode double-invokes it during render,
    // by which time `fileInput.current.value = ''` has cleared the input
    // and the live FileList may be empty. Deferring Array.from() there
    // computed "new total = 2" in the log while committing only [...prev],
    // which is exactly the stuck-at-one-file symptom.
    const incoming = Array.from(files)
    const staged = incoming.map((file) => ({ name: file.name, size: file.size, type: file.type }))
    // eslint-disable-next-line no-console
    console.log('[asset-upload] stageFiles: staging', JSON.stringify(staged))
    setPendingFiles((prev) => {
      // eslint-disable-next-line no-console
      console.log('[asset-upload] stageFiles: prev pending =', prev.length, ', committing total =', prev.length + incoming.length)
      return [...prev, ...incoming]
    })
    setNotice(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  function unstageFile(index: number) {
    const target = pendingFiles[index]
    if (target) {
      setFailedFiles((prev) => {
        const next = new Set(prev)
        next.delete(target)
        return next
      })
    }
    setPendingFiles((prev) => prev.filter((_, entry) => entry !== index))
  }

  // Removes an already-uploaded asset immediately (draft edits are
  // member-editable). Refreshes the draft so the budget meter and the
  // save precondition stay current; unsaved field text is left alone.
  async function dropAsset(key: string) {
    // eslint-disable-next-line no-console
    console.log('[asset-upload] dropAsset: key =', key, ', editable =', editable)
    if (!saved || !editable || droppingKey !== null) return
    setDroppingKey(key)
    setError(null)
    try {
      const { submission } = await apiRemoveSubmissionAsset(eventId, saved.id, key)
      setSaved(submission)
      setNotice('File removed.')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ASSET_NOT_FOUND') {
        const { submission } = await apiGetMySubmission(eventId).catch(() => ({ submission: null }))
        if (submission) setSaved(submission)
      }
      setError(submitErrorMessage(err))
    } finally {
      setDroppingKey(null)
    }
  }

  // Uploads staged files one by one and keeps going past individual
  // failures: one rejected file no longer strands the rest of the batch.
  // Failed files stay staged and marked, so the next save retries them.
  async function uploadPending(submissionId: string): Promise<boolean> {
    const queue = [...pendingFiles]
    if (queue.length === 0) return true
    setUploading(true)
    setError(null)
    setFailedFiles(new Set())
    setUploadCount({ done: 0, total: queue.length })
    const failed: File[] = []
    try {
      let done = 0
      for (const file of queue) {
        // eslint-disable-next-line no-console
        console.log('[asset-upload] uploadPending: uploading', file.name, `${file.size}B`, file.type, `(${done + 1}/${queue.length})`)
        try {
          const { submission } = await apiUploadSubmissionAsset(eventId, submissionId, file)
          // eslint-disable-next-line no-console
          console.log('[asset-upload] uploadPending: OK', file.name, ', server assets =', submission.assets.map((asset) => asset.name))
          setSaved(submission)
          setPendingFiles((prev) => prev.filter((entry) => entry !== file))
        } catch (err) {
          // eslint-disable-next-line no-console
          console.log('[asset-upload] uploadPending: FAILED', file.name, err instanceof ApiError ? `${err.code} ${err.status}` : String(err))
          failed.push(file)
          setFailedFiles((prev) => new Set(prev).add(file))
          setError(submitErrorMessage(err))
        }
        done += 1
        setUploadCount({ done, total: queue.length })
      }
    } finally {
      setUploading(false)
      setUploadCount(null)
    }
    if (failed.length > 0) {
      const names = failed.map((file) => file.name).join(', ')
      setError(
        failed.length === queue.length
          ? `Could not upload: ${names}. Fix or remove them and save again.`
          : `Uploaded ${queue.length - failed.length} of ${queue.length}. Failed: ${names}. Save again to retry.`,
      )
      return false
    }
    return true
  }

  // Finalize flushes unsaved field edits and staged files first, so the
  // finalized submission includes everything on screen. Aborts when the
  // flush fails (the error is already shown).
  async function finalize() {
    if (!saved || working || finalizePassword === '') return
    setWorking(true)
    setError(null)
    try {
      const flushed = await saveNow()
      if (!flushed) return
      await apiFinalizeSubmission(eventId, saved.id, finalizePassword)
      const { submission } = await apiGetMySubmission(eventId)
      setSaved(submission)
      setFields(submission ? fieldsFrom(submission) : null)
      setConfirmingFinalize(false)
      setFinalizePassword('')
      setNotice('Submission finalized. The roster is now locked.')
      router.refresh()
    } catch (err) {
      setError(submitErrorMessage(err))
    } finally {
      setWorking(false)
    }
  }

  async function remove() {
    if (!saved || working || deletePassword === '') return
    setWorking(true)
    setError(null)
    try {
      await apiDeleteSubmission(eventId, saved.id, deletePassword)
      setSaved(null)
      setFields(null)
      setPendingFiles([])
      lastSent.current = null
      setConfirmingDelete(false)
      setDeletePassword('')
      setNotice('Draft deleted. Press Start draft to begin again.')
      router.refresh()
    } catch (err) {
      setError(submitErrorMessage(err))
    } finally {
      setWorking(false)
    }
  }

  const inputClass =
    'h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a] disabled:opacity-60'
  const labelClass = 'mb-1.5 block text-[13px] font-bold text-foreground'

  if (!saved) {
    if (!submissionsOpen) {
      return (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-[15px] font-bold text-foreground">Submissions aren&apos;t open</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
            This event is not taking submissions right now. Come back during the submission phase.
          </p>
        </div>
      )
    }
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-[15px] font-bold text-foreground">Start your draft</h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          One draft per team. You&apos;ll pick a track inside the form — nothing is
          shared until you press Save draft or Finalize.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-[12px] font-semibold text-destructive">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={create}
          disabled={working}
          className="mt-4 inline-flex h-10 items-center rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
        >
          {working ? 'Creating…' : 'Start draft'}
        </button>
      </div>
    )
  }

  const usedBytes = saved.assetBytes
  const budgetPct = Math.min(100, Math.round((usedBytes / SUBMISSION_ASSET_TOTAL_BYTES) * 100))

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Submission status" className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
        <span
          className={cn(
            'rounded-full px-2 py-1 text-[11px] font-bold',
            saved.status === 'draft' ? 'bg-muted text-muted-foreground' : 'bg-[#16a34a]/10 text-[#16a34a] dark:text-[#22c55e]',
          )}
        >
          {saved.status === 'draft' ? 'Draft' : 'Final'}
        </span>
        <span className="text-[12px] text-muted-foreground">
          Track:{' '}
          <span className="font-bold text-foreground">
            {saved.trackName === '' ? 'No track selected' : saved.trackName}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
          {uploadCount !== null
            ? `Uploading ${uploadCount.done} of ${uploadCount.total}…`
            : saving || uploading
              ? 'Saving…'
              : 'Saves only via Save draft'}
          {saved.status === 'final' && <Lock size={13} strokeWidth={1.8} aria-hidden="true" />}
        </span>
      </section>

      {notice && (
        <p role="status" className="rounded-xl border border-[#16a34a]/30 bg-[#16a34a]/10 p-4 text-[12px] font-semibold text-[#16a34a] dark:text-[#22c55e]">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}

      <section aria-label="Submission details" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6">
        <div>
          <label htmlFor="submission-title" className={labelClass}>
            Title
          </label>
          <input
            id="submission-title"
            value={fields?.title ?? ''}
            disabled={!editable}
            onChange={(event) => patchFields({ title: event.target.value })}
            placeholder="Glass Signal"
            maxLength={80}
            className={inputClass}
          />
          {fieldHints.title && <p className="mt-1 text-[12px] font-semibold text-destructive">{fieldHints.title}</p>}
        </div>
        <div>
          <label htmlFor="submission-tagline" className={labelClass}>
            Tagline
          </label>
          <input
            id="submission-tagline"
            value={fields?.tagline ?? ''}
            disabled={!editable}
            onChange={(event) => patchFields({ tagline: event.target.value })}
            placeholder="One line that sells the project"
            maxLength={140}
            className={inputClass}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">{(fields?.tagline ?? '').length}/140</p>
          {fieldHints.tagline && <p className="mt-1 text-[12px] font-semibold text-destructive">{fieldHints.tagline}</p>}
        </div>
        <div>
          <label htmlFor="submission-description" className={labelClass}>
            Description
          </label>
          <textarea
            id="submission-description"
            value={fields?.description ?? ''}
            disabled={!editable}
            onChange={(event) => patchFields({ description: event.target.value })}
            placeholder="What did you build, and how does it work?"
            maxLength={500}
            rows={5}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a] disabled:opacity-60"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">{(fields?.description ?? '').length}/500</p>
          {fieldHints.description && <p className="mt-1 text-[12px] font-semibold text-destructive">{fieldHints.description}</p>}
        </div>
        <div>
          <label htmlFor="submission-tech" className={labelClass}>
            Tech stack
          </label>
          <input
            id="submission-tech"
            value={fields?.techStack ?? ''}
            disabled={!editable}
            onChange={(event) => patchFields({ techStack: event.target.value })}
            placeholder="Next.js, Postgres, SeaweedFS (comma separated)"
            className={inputClass}
          />
          {fieldHints.techStack && <p className="mt-1 text-[12px] font-semibold text-destructive">{fieldHints.techStack}</p>}
        </div>
        <div>
          <label htmlFor="submission-track" className={labelClass}>
            Track
          </label>
          <select
            id="submission-track"
            value={fields?.trackId ?? ''}
            disabled={!editable || tracks.length === 0}
            onChange={(event) => patchFields({ trackId: event.target.value })}
            className={inputClass}
          >
            {tracks.length === 0 ? (
              <option value="">Tracks aren&apos;t published yet</option>
            ) : (
              <>
                <option value="">Select a track…</option>
                {tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name}
                  </option>
                ))}
              </>
            )}
          </select>
          {fieldHints.trackId && <p className="mt-1 text-[12px] font-semibold text-destructive">{fieldHints.trackId}</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="submission-repo" className={labelClass}>
              Repository URL
            </label>
            <input
              id="submission-repo"
              value={fields?.repoUrl ?? ''}
              disabled={!editable}
              onChange={(event) => patchFields({ repoUrl: event.target.value })}
              placeholder="https://github.com/…"
              inputMode="url"
              className={cn(inputClass, 'font-mono')}
            />
            {fieldHints.repoUrl && <p className="mt-1 text-[12px] font-semibold text-destructive">{fieldHints.repoUrl}</p>}
          </div>
          <div>
            <label htmlFor="submission-demo" className={labelClass}>
              Demo URL
            </label>
            <input
              id="submission-demo"
              value={fields?.demoUrl ?? ''}
              disabled={!editable}
              onChange={(event) => patchFields({ demoUrl: event.target.value })}
              placeholder="https://…"
              inputMode="url"
              className={cn(inputClass, 'font-mono')}
            />
            {fieldHints.demoUrl && <p className="mt-1 text-[12px] font-semibold text-destructive">{fieldHints.demoUrl}</p>}
          </div>
        </div>
      </section>

      <section aria-label="Submission assets" className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-[15px] font-bold text-foreground">Assets</h3>
        <div className="mt-3 flex items-center gap-2" aria-live="polite">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-[#16a34a] transition-all"
              style={{ width: `${budgetPct}%` }}
            />
          </span>
          <span className="text-[11px] font-bold text-muted-foreground">
            {formatBytes(usedBytes)} of {formatBytes(SUBMISSION_ASSET_TOTAL_BYTES)}
          </span>
        </div>
        {saved.assets.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {saved.assets.map((asset) => (
              <li key={asset.key} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{asset.name}</span>
                <span className="shrink-0">{formatBytes(asset.sizeBytes)}</span>
                {editable && (
                  <button
                    type="button"
                    onClick={() => void dropAsset(asset.key)}
                    disabled={droppingKey !== null}
                    className="shrink-0 font-bold text-destructive hover:underline disabled:opacity-60"
                  >
                    {droppingKey === asset.key ? 'Removing…' : 'Remove'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <div className="mt-3">
            <label
              htmlFor="submission-assets"
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
            >
              <FileUp size={15} strokeWidth={1.8} aria-hidden="true" />
              Add Assets
            </label>
            <input
              ref={fileInput}
              id="submission-assets"
              type="file"
              multiple
              onChange={(event) => stageFiles(event.target.files)}
              className="sr-only"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Files stay on this page until you press Save draft or Finalize. Images, zips,
              PDFs, slides, MP4/WebM. One total budget — a single file may use all of it.
            </p>
          </div>
        )}
        {pendingFiles.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {pendingFiles.map((file, index) => {
              const failed = failedFiles.has(file)
              return (
                <li key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{file.name}</span>
                  <span className="shrink-0">{formatBytes(file.size)}</span>
                  <span
                    className={
                      failed
                        ? 'shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive'
                        : 'shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold'
                    }
                  >
                    {failed ? 'Upload failed — retries on next save' : 'Pending upload'}
                  </span>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => unstageFile(index)}
                      className="shrink-0 font-bold text-destructive hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          {isLeader &&
            (!confirmingFinalize ? (
              <button
                type="button"
                onClick={() => setConfirmingFinalize(true)}
                disabled={working}
                className="inline-flex h-10 items-center rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
              >
                Finalize submission
              </button>
            ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                finalize()
              }}
              className="flex basis-full flex-wrap items-center gap-2 rounded-xl border border-[#16a34a]/30 bg-[#16a34a]/5 p-4"
            >
              <p className="basis-full text-[12px] font-semibold text-foreground">
                Finalize submission — this action is not reversible. The roster locks and no
                further changes are possible.
              </p>
              <label htmlFor={`finalize-${saved.id}`} className="sr-only">
                Confirm with your password
              </label>
              <input
                id={`finalize-${saved.id}`}
                type="password"
                value={finalizePassword}
                onChange={(event) => setFinalizePassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Your password"
                className="h-10 w-52 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
              />
              <button
                type="submit"
                disabled={working || finalizePassword === ''}
                className="inline-flex h-10 items-center rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
              >
                {working ? 'Finalizing…' : 'Confirm finalize'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingFinalize(false)
                  setFinalizePassword('')
                }}
                disabled={working}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                Back
              </button>
            </form>
            ))}
          <button
            type="button"
            onClick={() => void saveNow()}
            disabled={saving || uploading}
            className="inline-flex h-10 items-center rounded-lg border border-border px-5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            {saving || uploading ? 'Saving…' : 'Save draft'}
          </button>
          {isLeader &&
            (!confirmingDelete ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={working}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-destructive/40 px-5 text-[13px] font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
            >
              <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" /> Delete draft
            </button>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                remove()
              }}
              className="flex basis-full flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
            >
              <p className="basis-full text-[12px] font-semibold text-foreground">
                Warning: deleting removes this draft and its uploaded assets. This cannot be
                undone.
              </p>
              <label htmlFor={`delete-draft-${saved.id}`} className="sr-only">
                Confirm with your password
              </label>
              <input
                id={`delete-draft-${saved.id}`}
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Your password"
                className="h-10 w-52 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-destructive"
              />
              <button
                type="submit"
                disabled={working || deletePassword === ''}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-destructive px-5 text-[13px] font-bold text-white transition-colors hover:opacity-90 disabled:opacity-60"
              >
                {working ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false)
                  setDeletePassword('')
                }}
                disabled={working}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                Keep draft
              </button>
            </form>
            ))}
        </div>
      )}

      <Link
        href={`/hackathons/${slug}`}
        className="inline-flex h-10 w-fit items-center rounded-lg border border-border px-5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
      >
        Back to event
      </Link>
    </div>
  )
}
