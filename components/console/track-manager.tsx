'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  ApiError,
  apiCreateTrack,
  apiDeleteTrack,
  apiUpdateTrack,
  type TrackPayload,
  validationDetailsMessage,
} from '@/lib/api-client'

function summarizeRules(rules: Record<string, unknown>): string {
  const parts: string[] = []
  if (typeof rules.max_team_size === 'number') parts.push(`≤${rules.max_team_size} members`)
  if (rules.student_only === true) parts.push('students only')
  if (Array.isArray(rules.required_tech) && rules.required_tech.length > 0) {
    parts.push(`requires ${rules.required_tech.filter((t) => typeof t === 'string').join(', ')}`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'Open to all'
}

interface RuleFields {
  maxTeamSize: string
  studentOnly: boolean
  requiredTech: string
}

function rulesFromFields(fields: RuleFields): Record<string, unknown> {
  const rules: Record<string, unknown> = {}
  const max = Number.parseInt(fields.maxTeamSize, 10)
  if (fields.maxTeamSize.trim() !== '' && Number.isSafeInteger(max) && max >= 1) {
    rules.max_team_size = max
  }
  if (fields.studentOnly) rules.student_only = true
  const tech = fields.requiredTech.split(',').map((t) => t.trim()).filter(Boolean)
  if (tech.length > 0) rules.required_tech = tech
  return rules
}

function fieldsFromRules(rules: Record<string, unknown>): RuleFields {
  return {
    maxTeamSize: typeof rules.max_team_size === 'number' ? String(rules.max_team_size) : '',
    studentOnly: rules.student_only === true,
    requiredTech: Array.isArray(rules.required_tech)
      ? rules.required_tech.filter((t) => typeof t === 'string').join(', ')
      : '',
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'TRACK_IN_USE') return 'This track has submissions and cannot be deleted.'
    if (error.code === 'FORBIDDEN') return 'Track changes are DRAFT-only.'
    if (error.code === 'VALIDATION_ERROR')
      return validationDetailsMessage(error) ?? 'Check the track fields and try again.'
    if (error.code === 'NETWORK_ERROR') return 'Request failed. Is the server running?'
  }
  return 'Request failed. Try again.'
}

const inputClass =
  'h-10 rounded-lg border border-border bg-background px-3 text-[13px] outline-none placeholder:text-muted-foreground focus:border-[#16a34a] disabled:opacity-60'

// Organizer track list + guided eligibility editor. Structural changes are
// DRAFT-only (the API refuses otherwise); `locked` renders that state.
export default function TrackManager({
  eventId,
  initialTracks,
  locked,
}: {
  eventId: string
  initialTracks: TrackPayload[]
  locked: boolean
}) {
  const router = useRouter()
  const [tracks, setTracks] = useState(initialTracks)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [fields, setFields] = useState<RuleFields>({ maxTeamSize: '', studentOnly: false, requiredTech: '' })
  const [rawMode, setRawMode] = useState(false)
  const [rawJson, setRawJson] = useState('{}')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function openAdd() {
    setEditingId(null)
    setName('')
    setDescription('')
    setFields({ maxTeamSize: '', studentOnly: false, requiredTech: '' })
    setRawJson('{}')
    setError(null)
    setAdding(true)
  }

  function openEdit(track: TrackPayload) {
    setAdding(false)
    setEditingId(track.id)
    setName(track.name)
    setDescription(track.description ?? '')
    setFields(fieldsFromRules(track.eligibilityRules))
    setRawJson(JSON.stringify(track.eligibilityRules, null, 2))
    setError(null)
  }

  function closeForm() {
    setAdding(false)
    setEditingId(null)
    setError(null)
  }

  function buildRules(): Record<string, unknown> {
    if (!rawMode) return rulesFromFields(fields)
    const parsed: unknown = JSON.parse(rawJson)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Rules must be a JSON object')
    }
    return parsed as Record<string, unknown>
  }

  async function onSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault()
    setError(null)
    let rules: Record<string, unknown>
    try {
      rules = buildRules()
    } catch {
      setError('Rules must be a valid JSON object.')
      return
    }
    setPending(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() === '' ? null : description.trim(),
        eligibilityRules: rules,
      }
      if (editingId) {
        const updated = await apiUpdateTrack(eventId, editingId, payload)
        setTracks((prev) => prev.map((t) => (t.id === editingId ? updated : t)))
      } else {
        const created = await apiCreateTrack(eventId, payload)
        setTracks((prev) => [...prev, created])
      }
      closeForm()
      router.refresh()
    } catch (submitError) {
      setError(errorMessage(submitError))
    } finally {
      setPending(false)
    }
  }

  async function onDelete(trackId: string) {
    if (confirmingId !== trackId) {
      setConfirmingId(trackId)
      return
    }
    setConfirmingId(null)
    setError(null)
    setPending(true)
    try {
      await apiDeleteTrack(eventId, trackId)
      setTracks((prev) => prev.filter((t) => t.id !== trackId))
      router.refresh()
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    } finally {
      setPending(false)
    }
  }

  const formOpen = adding || editingId !== null

  return (
    <div className="flex flex-col gap-4">
      {locked && (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-[12px] font-semibold text-muted-foreground">
          This event has left DRAFT, so tracks are read-only.
        </p>
      )}
      {tracks.length === 0 && !formOpen && (
        <p className="rounded-xl border border-border bg-card p-6 text-[13px] text-muted-foreground">
          No tracks yet. Add the first one below.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {tracks.map((track) => (
          <li
            key={track.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold text-foreground">{track.name}</p>
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                {summarizeRules(track.eligibilityRules)}
              </p>
            </div>
            {!locked && (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(track)}
                  aria-label={`Edit ${track.name}`}
                  className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil size={16} strokeWidth={1.8} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(track.id)}
                  aria-label={confirmingId === track.id ? `Confirm delete ${track.name}` : `Delete ${track.name}`}
                  className="flex h-9 items-center justify-center gap-1 rounded-lg px-2 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                >
                  <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                  {confirmingId === track.id ? 'Confirm' : ''}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {!locked && !formOpen && (
        <div>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            <Plus size={16} strokeWidth={1.8} aria-hidden="true" /> Add track
          </button>
        </div>
      )}

      {!locked && formOpen && (
        <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-bold text-foreground">{editingId ? 'Edit track' : 'New track'}</p>
            <button
              type="button"
              onClick={closeForm}
              aria-label="Close track form"
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
            Name
            <input
              required
              value={name}
              disabled={pending}
              onChange={(formEvent) => setName(formEvent.target.value)}
              placeholder="Best Use of Local LLMs"
              maxLength={200}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
            Description
            <input
              value={description}
              disabled={pending}
              onChange={(formEvent) => setDescription(formEvent.target.value)}
              placeholder="What belongs in this track"
              maxLength={2000}
              className={inputClass}
            />
          </label>
          <div className="flex items-center gap-2">
            <p className="text-[12px] font-semibold text-foreground">Eligibility</p>
            <button
              type="button"
              onClick={() => setRawMode(!rawMode)}
              className="text-[12px] font-semibold text-[#16a34a] dark:text-[#22c55e]"
            >
              {rawMode ? 'Use guided fields' : 'Edit raw JSON'}
            </button>
          </div>
          {rawMode ? (
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
              Rules JSON
              <textarea
                value={rawJson}
                disabled={pending}
                onChange={(formEvent) => setRawJson(formEvent.target.value)}
                rows={4}
                spellCheck={false}
                className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12px] outline-none focus:border-[#16a34a]"
              />
            </label>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
                Max team size
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={fields.maxTeamSize}
                  disabled={pending}
                  onChange={(formEvent) => setFields({ ...fields, maxTeamSize: formEvent.target.value })}
                  placeholder="No limit"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
                Required tech (comma-separated)
                <input
                  value={fields.requiredTech}
                  disabled={pending}
                  onChange={(formEvent) => setFields({ ...fields, requiredTech: formEvent.target.value })}
                  placeholder="postgres, next"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-row items-center gap-2 text-[12px] font-semibold text-foreground">
                <input
                  type="checkbox"
                  checked={fields.studentOnly}
                  disabled={pending}
                  onChange={(formEvent) => setFields({ ...fields, studentOnly: formEvent.target.checked })}
                  className="size-4 accent-[#16a34a]"
                />
                Students only
              </label>
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-[12px] font-semibold text-destructive">
              {error}
            </p>
          )}
          <div>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-10 items-center rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
            >
              {pending ? 'Saving…' : editingId ? 'Save track' : 'Add track'}
            </button>
          </div>
        </form>
      )}

      {error && !formOpen && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
