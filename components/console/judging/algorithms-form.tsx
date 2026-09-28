'use client'

import { useState } from 'react'

import {
  ApiError,
  apiUpdateEvent,
  validationDetailsMessage,
  type EventPayload,
} from '@/lib/api-client'

const ASSIGNMENT_OPTIONS = [
  { value: 'K_COVER', label: 'Load-balanced k-cover', hint: 'Every project gets the minimum reviews; judge queues stay balanced.' },
  { value: 'ROUND_ROBIN', label: 'Round-robin', hint: 'Projects are dealt evenly across judges in rotation.' },
] as const

const NORMALIZATION_OPTIONS = [
  { value: 'RAW_MEAN', label: 'Raw weighted mean', hint: 'Standard weighted sum of rubric criteria.' },
  { value: 'Z_SCORE', label: 'Z-score', hint: 'Standardizes each judge’s scoring distribution.' },
  { value: 'MIN_MAX', label: 'Min-max rescale', hint: 'Rescales each judge to a 0–100 scale.' },
  { value: 'TRIMMED_MEAN', label: 'Trimmed mean', hint: 'Drops extremes for submissions with 5+ reviews.' },
] as const

function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'LIVE_EDIT_LOCKED') return 'That change is locked once the event is live.'
    if (error.code === 'FORBIDDEN') return 'Only organizers can change judging settings.'
    if (error.code === 'NETWORK_ERROR') return 'Request failed. Is the server running?'
    if (error.code === 'VALIDATION_ERROR') return validationDetailsMessage(error) ?? 'Check the input.'
  }
  return 'Request failed. Try again.'
}

const selectClass =
  'h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-[#16a34a] disabled:opacity-60'

// Judging engines: assignment algorithm + score normalization selects,
// judges-per-submission, and the double-blind toggle. All PATCH the event,
// so the live-edit freeze applies once the event leaves draft.
export function AlgorithmsForm({ event }: { event: EventPayload }) {
  const [assignmentAlgorithm, setAssignmentAlgorithm] = useState(event.assignmentAlgorithm ?? 'K_COVER')
  const [normalization, setNormalization] = useState(event.normalization ?? 'RAW_MEAN')
  const [judgesPerSubmission, setJudgesPerSubmission] = useState(event.judgesPerSubmission ?? 3)
  const [doubleBlindJudging, setDoubleBlindJudging] = useState(event.doubleBlindJudging ?? false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const dirty =
    assignmentAlgorithm !== (event.assignmentAlgorithm ?? 'K_COVER') ||
    normalization !== (event.normalization ?? 'RAW_MEAN') ||
    judgesPerSubmission !== (event.judgesPerSubmission ?? 3) ||
    doubleBlindJudging !== (event.doubleBlindJudging ?? false)

  async function save() {
    setWorking(true)
    setError(null)
    try {
      await apiUpdateEvent(event.id, {
        assignmentAlgorithm,
        normalization,
        judgesPerSubmission,
        doubleBlindJudging,
      })
      setNotice('Judging settings saved.')
    } catch (err) {
      setError(message(err))
    } finally {
      setWorking(false)
    }
  }

  return (
    <section aria-label="Judging engines" className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-[15px] font-bold text-foreground">Engines & settings</h3>
      {notice && (
        <p role="status" className="mt-3 rounded-xl border border-[#16a34a]/30 bg-[#16a34a]/10 p-3 text-[12px] font-semibold text-[#16a34a] dark:text-[#22c55e]">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="assignment-algorithm" className="mb-1.5 block text-[13px] font-bold text-foreground">
            Assignment algorithm
          </label>
          <select
            id="assignment-algorithm"
            value={assignmentAlgorithm}
            onChange={(event) => setAssignmentAlgorithm(event.target.value as typeof assignmentAlgorithm)}
            className={selectClass}
          >
            {ASSIGNMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {ASSIGNMENT_OPTIONS.find((option) => option.value === assignmentAlgorithm)?.hint}
          </p>
        </div>
        <div>
          <label htmlFor="normalization" className="mb-1.5 block text-[13px] font-bold text-foreground">
            Score normalization
          </label>
          <select
            id="normalization"
            value={normalization}
            onChange={(event) => setNormalization(event.target.value as typeof normalization)}
            className={selectClass}
          >
            {NORMALIZATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {NORMALIZATION_OPTIONS.find((option) => option.value === normalization)?.hint}
          </p>
        </div>
        <div>
          <label htmlFor="judges-per-submission" className="mb-1.5 block text-[13px] font-bold text-foreground">
            Reviews per submission
          </label>
          <input
            id="judges-per-submission"
            type="number"
            min={1}
            max={100}
            value={judgesPerSubmission}
            onChange={(event) => setJudgesPerSubmission(Number(event.target.value))}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-[#16a34a]"
          />
        </div>
        <div className="flex items-end pb-1">
          <label htmlFor="double-blind" className="flex cursor-pointer items-center gap-2 text-[13px] font-bold text-foreground">
            <input
              id="double-blind"
              type="checkbox"
              checked={doubleBlindJudging}
              onChange={(event) => setDoubleBlindJudging(event.target.checked)}
              className="size-4 accent-[#16a34a]"
            />
            Double-blind judging
          </label>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Double-blind hides team names and members from judges. These settings stay editable while
        live: the algorithm applies to newly generated assignments, and normalization recomputes
        on the next rankings read.
      </p>
      <button
        type="button"
        onClick={() => void save()}
        disabled={working || !dirty}
        title={!dirty ? 'No changes to save — edit a setting first.' : undefined}
        className="mt-3 inline-flex h-9 items-center rounded-lg bg-[#16a34a] px-4 text-[12px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
      >
        {working ? 'Saving…' : 'Save settings'}
      </button>
      {!dirty && !working && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          No changes — the form matches the saved settings.
        </p>
      )}
    </section>
  )
}
