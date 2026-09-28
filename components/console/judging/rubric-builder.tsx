'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import {
  ApiError,
  apiSaveRubric,
  validationDetailsMessage,
  type RubricCriterionPayload,
  type RubricPayload,
} from '@/lib/api-client'

interface DraftCriterion extends RubricCriterionPayload {
  key: string
}

function newCriterion(): DraftCriterion {
  return {
    key: Math.random().toString(36).slice(2, 10),
    id: '',
    label: '',
    weight: 1,
    minScore: 0,
    maxScore: 10,
    kind: 'int',
    step: 1,
  }
}

function fromPayload(rubric: RubricPayload | null): DraftCriterion[] {
  if (!rubric) return [newCriterion()]
  return rubric.criteriaJson.map((criterion) => ({
    key: criterion.id,
    ...criterion,
    kind: criterion.kind ?? 'int',
    step: criterion.step ?? 1,
  }))
}

function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_RUBRIC') return 'That rubric is invalid: check ids, bounds, and weights.'
    if (error.code === 'FORBIDDEN') return 'Only organizers can edit rubrics.'
    if (error.code === 'NETWORK_ERROR') return 'Request failed. Is the server running?'
    if (error.code === 'VALIDATION_ERROR') return validationDetailsMessage(error) ?? 'Check the highlighted fields.'
  }
  return 'Request failed. Try again.'
}

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a] disabled:opacity-60'

// Rubric builder: one rubric per event, dynamic criteria rows with label,
// id, weight, min/max, int-or-float scoring, and float step size. Bounds and
// step rules mirror the API so judges see exactly what validates.
export function RubricBuilder({
  eventId,
  initial,
}: {
  eventId: string
  initial: RubricPayload | null
}) {
  const [title, setTitle] = useState(initial?.title ?? 'Event rubric')
  const [criteria, setCriteria] = useState<DraftCriterion[]>(() => fromPayload(initial))
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  function patch(key: string, patch: Partial<DraftCriterion>) {
    setCriteria((prev) => prev.map((criterion) => (criterion.key === key ? { ...criterion, ...patch } : criterion)))
  }

  const totalWeight = criteria.reduce((sum, criterion) => sum + (Number(criterion.weight) || 0), 0)

  async function save() {
    setWorking(true)
    setError(null)
    try {
      const payload = criteria.map(({ key: _key, ...criterion }) => ({
        ...criterion,
        weight: Number(criterion.weight) || 0,
        minScore: Number(criterion.minScore),
        maxScore: Number(criterion.maxScore),
        step: criterion.kind === 'float' ? Number(criterion.step) || 0.01 : 1,
      }))
      await apiSaveRubric({ eventId, id: initial?.id, title: title.trim(), criteriaJson: payload })
      setNotice('Rubric saved.')
    } catch (err) {
      setError(message(err))
    } finally {
      setWorking(false)
    }
  }

  return (
    <section aria-label="Rubric" className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-[15px] font-bold text-foreground">Rubric</h3>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Judges score every criterion within its bounds. Total weight: {totalWeight}.
      </p>
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
      <label htmlFor="rubric-title" className="mb-1.5 mt-4 block text-[13px] font-bold text-foreground">
        Rubric title
      </label>
      <input
        id="rubric-title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={160}
        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
      />
      <ul className="mt-4 flex flex-col gap-3">
        {criteria.map((criterion, index) => (
          <li key={criterion.key} className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-muted-foreground">#{index + 1}</span>
              <button
                type="button"
                onClick={() => setCriteria((prev) => prev.filter((entry) => entry.key !== criterion.key))}
                disabled={criteria.length <= 1}
                aria-label={`Remove criterion ${index + 1}`}
                className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
              >
                <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[12px] font-bold text-foreground">Label</label>
                <input
                  value={criterion.label}
                  onChange={(event) => patch(criterion.key, { label: event.target.value })}
                  placeholder="Innovation"
                  maxLength={160}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-bold text-foreground">Stable ID</label>
                <input
                  value={criterion.id}
                  onChange={(event) => patch(criterion.key, { id: event.target.value.trim() })}
                  placeholder="innovation"
                  maxLength={80}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-bold text-foreground">Weight</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={criterion.weight}
                  onChange={(event) => patch(criterion.key, { weight: Number(event.target.value) })}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[12px] font-bold text-foreground">Min</label>
                  <input
                    type="number"
                    step="any"
                    value={criterion.minScore}
                    onChange={(event) => patch(criterion.key, { minScore: Number(event.target.value) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-bold text-foreground">Max</label>
                  <input
                    type="number"
                    step="any"
                    value={criterion.maxScore}
                    onChange={(event) => patch(criterion.key, { maxScore: Number(event.target.value) })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-bold text-foreground">Score type</label>
                <select
                  value={criterion.kind}
                  onChange={(event) =>
                    patch(criterion.key, { kind: event.target.value as 'int' | 'float' })
                  }
                  className={inputClass}
                >
                  <option value="int">Whole numbers</option>
                  <option value="float">Decimals</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-bold text-foreground">Step size</label>
                <input
                  type="number"
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={criterion.step}
                  disabled={criterion.kind !== 'float'}
                  onChange={(event) => patch(criterion.key, { step: Number(event.target.value) })}
                  className={inputClass}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCriteria((prev) => [...prev, newCriterion()])}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-bold text-foreground transition-colors hover:bg-muted"
        >
          <Plus size={14} strokeWidth={1.8} aria-hidden="true" /> Add criterion
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={working}
          className="inline-flex h-9 items-center rounded-lg bg-[#16a34a] px-4 text-[12px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
        >
          {working ? 'Saving…' : 'Save rubric'}
        </button>
      </div>
    </section>
  )
}
