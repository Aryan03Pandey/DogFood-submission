'use client'

import { useState } from 'react'
import { Eraser, Flag, Save } from 'lucide-react'

import {
  ApiError,
  apiClearJudgeScore,
  apiFlagSubmission,
  apiSaveJudgeScore,
  apiUnflagSubmission,
  validationDetailsMessage,
  type JudgeDetailPayload,
} from '@/lib/api-client'

const FLAG_REASONS = ['PLAGIARISM', 'OFF_TOPIC', 'INCOMPLETE', 'INAPPROPRIATE', 'OTHER'] as const

function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_RUBRIC_SCORES') return 'Some scores are empty or outside their allowed range.'
    if (error.code === 'FORBIDDEN') return 'You can only score your own assignments.'
    if (error.code === 'NETWORK_ERROR') return 'Request failed. Is the server running?'
    if (error.code === 'VALIDATION_ERROR') return validationDetailsMessage(error) ?? 'Check the scores.'
  }
  return 'Request failed. Try again.'
}

const inputClass =
  'h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a] disabled:opacity-60'

// Scoring column: rubric inputs bounded exactly like the API, comment,
// Save / Clear / Flag actions. Every rule enforced here is re-checked by
// the API; the UI only keeps the form honest.
export function ScoringPanel({
  detail,
  onChanged,
}: {
  detail: JudgeDetailPayload
  onChanged: () => void
}) {
  const criteria = detail.rubric?.criteriaJson ?? []
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      criteria.map((criterion) => [
        criterion.id,
        detail.score?.rubricScoresJson[criterion.id]?.toString() ?? '',
      ]),
    ),
  )
  const [comment, setComment] = useState(detail.score?.comment ?? '')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [flagging, setFlagging] = useState(false)
  const [flagReason, setFlagReason] = useState<(typeof FLAG_REASONS)[number]>('OFF_TOPIC')
  const [flagComment, setFlagComment] = useState(detail.flag?.comment ?? '')

  function setValue(id: string, value: string) {
    setValues((prev) => ({ ...prev, [id]: value }))
  }

  // Client mirror of the API bounds: every criterion filled, in range, and
  // on-step. The server re-validates; this only yields early error text.
  function validate(): Record<string, number> | null {
    const parsed: Record<string, number> = {}
    for (const criterion of criteria) {
      const raw = (values[criterion.id] ?? '').trim()
      if (raw === '') return null
      const value = Number(raw)
      const min = criterion.minScore ?? 0
      const max = criterion.maxScore ?? 10
      const kind = criterion.kind ?? 'int'
      const step = criterion.step ?? 1
      if (!Number.isFinite(value) || value < min || value > max) return null
      if (kind === 'int' && !Number.isInteger(value)) return null
      if (kind === 'float' && Math.abs((value - min) / step - Math.round((value - min) / step)) > 1e-9)
        return null
      parsed[criterion.id] = value
    }
    return parsed
  }

  async function save() {
    const parsed = validate()
    if (!parsed) {
      setError('Fill every criterion with a valid score inside its range.')
      return
    }
    setWorking(true)
    setError(null)
    try {
      await apiSaveJudgeScore({
        assignmentId: detail.assignmentId,
        rubricScoresJson: parsed,
        comment: comment.trim() === '' ? undefined : comment.trim(),
      })
      setNotice('Score saved.')
      onChanged()
    } catch (err) {
      setError(message(err))
    } finally {
      setWorking(false)
    }
  }

  async function clear() {
    setWorking(true)
    setError(null)
    try {
      await apiClearJudgeScore(detail.assignmentId)
      setValues(Object.fromEntries(criteria.map((criterion) => [criterion.id, ''])))
      setComment('')
      setConfirmingClear(false)
      setNotice('Score cleared — this assignment is pending again.')
      onChanged()
    } catch (err) {
      setError(message(err))
    } finally {
      setWorking(false)
    }
  }

  async function flag() {
    setWorking(true)
    setError(null)
    try {
      await apiFlagSubmission({
        assignmentId: detail.assignmentId,
        reason: flagReason,
        comment: flagComment.trim() === '' ? undefined : flagComment.trim(),
      })
      setFlagging(false)
      setNotice('Submission flagged.')
      onChanged()
    } catch (err) {
      setError(message(err))
    } finally {
      setWorking(false)
    }
  }

  async function unflag() {
    setWorking(true)
    setError(null)
    try {
      await apiUnflagSubmission(detail.assignmentId)
      setFlagComment('')
      setNotice('Flag removed.')
      onChanged()
    } catch (err) {
      setError(message(err))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[15px] font-bold text-foreground">Scoring</h3>
      {detail.rubric === null ? (
        <p className="text-[13px] text-muted-foreground">No rubric published for this event yet.</p>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          Rubric: <span className="font-bold text-foreground">{detail.rubric.title}</span>
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-[#16a34a]/30 bg-[#16a34a]/10 p-3 text-[12px] font-semibold text-[#16a34a] dark:text-[#22c55e]">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}
      {criteria.map((criterion) => {
        const min = criterion.minScore ?? 0
        const max = criterion.maxScore ?? 10
        const kind = criterion.kind ?? 'int'
        const step = criterion.step ?? 1
        return (
          <div key={criterion.id}>
            <label htmlFor={`score-${criterion.id}`} className="mb-1 block text-[13px] font-bold text-foreground">
              {criterion.label}
              <span className="ml-1.5 font-semibold text-muted-foreground">
                {min}–{max}{kind === 'float' ? `, step ${step}` : ''} · weight {criterion.weight}
              </span>
            </label>
            <input
              id={`score-${criterion.id}`}
              type="number"
              min={min}
              max={max}
              step={kind === 'float' ? step : 1}
              value={values[criterion.id] ?? ''}
              onChange={(event) => setValue(criterion.id, event.target.value)}
              placeholder={`${min}–${max}`}
              className={inputClass}
            />
          </div>
        )
      })}
      <div>
        <label htmlFor="score-comment" className="mb-1 block text-[13px] font-bold text-foreground">
          Comments
        </label>
        <textarea
          id="score-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="What stood out?"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={working || criteria.length === 0}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
        >
          <Save size={15} strokeWidth={1.8} aria-hidden="true" />
          {working ? 'Saving…' : 'Save'}
        </button>
        {!confirmingClear ? (
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            disabled={working}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            <Eraser size={15} strokeWidth={1.8} aria-hidden="true" /> Clear
          </button>
        ) : (
          <span className="flex basis-full flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <span className="basis-full text-[12px] font-semibold text-foreground">
              Warning: clearing removes the current inputs and any previously saved score for this
              assignment. This cannot be undone.
            </span>
            <button
              type="button"
              onClick={() => void clear()}
              disabled={working}
              className="inline-flex h-9 items-center rounded-lg bg-destructive px-4 text-[12px] font-bold text-white transition-colors hover:opacity-90 disabled:opacity-60"
            >
              {working ? 'Clearing…' : 'Confirm clear'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingClear(false)}
              disabled={working}
              className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-[12px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              Keep score
            </button>
          </span>
        )}
        {detail.flag === null ? (
          !flagging ? (
            <button
              type="button"
              onClick={() => setFlagging(true)}
              disabled={working}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-destructive/40 px-4 text-[13px] font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
            >
              <Flag size={15} strokeWidth={1.8} aria-hidden="true" /> Flag
            </button>
          ) : (
            <span className="flex basis-full flex-col gap-2 rounded-xl border border-border p-3">
              <label htmlFor="flag-reason" className="text-[12px] font-bold text-foreground">
                Reason
              </label>
              <select
                id="flag-reason"
                value={flagReason}
                onChange={(event) => setFlagReason(event.target.value as typeof flagReason)}
                className={inputClass}
              >
                {FLAG_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason.replace('_', ' ')}
                  </option>
                ))}
              </select>
              <label htmlFor="flag-comment" className="text-[12px] font-bold text-foreground">
                Comment
              </label>
              <textarea
                id="flag-comment"
                value={flagComment}
                onChange={(event) => setFlagComment(event.target.value)}
                rows={3}
                maxLength={1000}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
              />
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void flag()}
                  disabled={working}
                  className="inline-flex h-9 items-center rounded-lg bg-destructive px-4 text-[12px] font-bold text-white transition-colors hover:opacity-90 disabled:opacity-60"
                >
                  {working ? 'Flagging…' : 'Confirm flag'}
                </button>
                <button
                  type="button"
                  onClick={() => setFlagging(false)}
                  disabled={working}
                  className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-[12px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  Cancel
                </button>
              </span>
            </span>
          )
        ) : (
          <span className="flex basis-full flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <span className="basis-full text-[12px] font-semibold text-foreground">
              Flagged: {detail.flag.reason.replace('_', ' ')}
              {detail.flag.comment ? ` — ${detail.flag.comment}` : ''}
            </span>
            <button
              type="button"
              onClick={() => void unflag()}
              disabled={working}
              className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-[12px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              Remove flag
            </button>
          </span>
        )}
      </div>
    </div>
  )
}
