'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  ApiError,
  apiCreatePrize,
  apiDeletePrize,
  apiUpdatePrize,
  type PrizePayload,
  type TrackPayload,
  validationDetailsMessage,
} from '@/lib/api-client'

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'PRIZE_LOCKED')
      return 'Prize values can only be increased once the event has left DRAFT.'
    if (error.code === 'INVALID_TRACK') return 'That track does not belong to this event.'
    if (error.code === 'FORBIDDEN') return 'You cannot change prizes for this event.'
    if (error.code === 'VALIDATION_ERROR')
      return validationDetailsMessage(error) ?? 'Check the prize fields and try again.'
    if (error.code === 'NETWORK_ERROR') return 'Request failed. Is the server running?'
  }
  return 'Request failed. Try again.'
}

const inputClass =
  'h-10 rounded-lg border border-border bg-background px-3 text-[13px] outline-none placeholder:text-muted-foreground focus:border-[#16a34a] disabled:opacity-60'

// Organizer prize list + editor. Past DRAFT, amounts may only move up (the
// database trigger enforces the same rule); deletion is DRAFT-only. `locked`
// renders that state when the event has left DRAFT.
export default function PrizeManager({
  eventId,
  tracks,
  initialPrizes,
  locked,
}: {
  eventId: string
  tracks: TrackPayload[]
  initialPrizes: PrizePayload[]
  locked: boolean
}) {
  const router = useRouter()
  const [prizes, setPrizes] = useState(initialPrizes)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [trackId, setTrackId] = useState('')
  const [cashValue, setCashValue] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function trackName(id: string | null): string {
    if (id == null) return 'Event-wide'
    return tracks.find((t) => t.id === id)?.name ?? 'Unknown track'
  }

  function openAdd() {
    setEditingId(null)
    setTitle('')
    setTrackId('')
    setCashValue('')
    setError(null)
    setAdding(true)
  }

  function openEdit(prize: PrizePayload) {
    setAdding(false)
    setEditingId(prize.id)
    setTitle(prize.title)
    setTrackId(prize.trackId ?? '')
    setCashValue(String(prize.cashValue))
    setError(null)
  }

  function closeForm() {
    setAdding(false)
    setEditingId(null)
    setError(null)
  }

  async function onSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault()
    setError(null)
    const amount = Number.parseInt(cashValue, 10)
    if (!Number.isSafeInteger(amount) || amount < 0) {
      setError('Amount must be a whole number of 0 or more.')
      return
    }
    setPending(true)
    try {
      const payload = {
        title: title.trim(),
        trackId: trackId === '' ? null : trackId,
        cashValue: amount,
      }
      if (editingId) {
        const updated = await apiUpdatePrize(eventId, editingId, payload)
        setPrizes((prev) => prev.map((p) => (p.id === editingId ? updated : p)))
      } else {
        const created = await apiCreatePrize(eventId, payload)
        setPrizes((prev) => [...prev, created])
      }
      closeForm()
      router.refresh()
    } catch (submitError) {
      setError(errorMessage(submitError))
    } finally {
      setPending(false)
    }
  }

  async function onDelete(prizeId: string) {
    if (confirmingId !== prizeId) {
      setConfirmingId(prizeId)
      return
    }
    setConfirmingId(null)
    setError(null)
    setPending(true)
    try {
      await apiDeletePrize(eventId, prizeId)
      setPrizes((prev) => prev.filter((p) => p.id !== prizeId))
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
          This event has left DRAFT, so prize amounts can only be increased — never decreased or removed.
        </p>
      )}
      {prizes.length === 0 && !formOpen && (
        <p className="rounded-xl border border-border bg-card p-6 text-[13px] text-muted-foreground">
          No prizes yet. Add the first one below.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {prizes.map((prize) => (
          <li
            key={prize.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold text-foreground">{prize.title}</p>
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                {trackName(prize.trackId)} · ${prize.cashValue.toLocaleString('en-US')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => openEdit(prize)}
                aria-label={`Edit ${prize.title}`}
                className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil size={16} strokeWidth={1.8} aria-hidden="true" />
              </button>
              {!locked && (
                <button
                  type="button"
                  onClick={() => onDelete(prize.id)}
                  aria-label={confirmingId === prize.id ? `Confirm delete ${prize.title}` : `Delete ${prize.title}`}
                  className="flex h-9 items-center justify-center gap-1 rounded-lg px-2 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                >
                  <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                  {confirmingId === prize.id ? 'Confirm' : ''}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!formOpen && (
        <div>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            <Plus size={16} strokeWidth={1.8} aria-hidden="true" /> Add prize
          </button>
        </div>
      )}

      {formOpen && (
        <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-bold text-foreground">{editingId ? 'Edit prize' : 'New prize'}</p>
            <button
              type="button"
              onClick={closeForm}
              aria-label="Close prize form"
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
            Title
            <input
              required
              value={title}
              disabled={pending}
              onChange={(formEvent) => setTitle(formEvent.target.value)}
              placeholder="Grand prize"
              maxLength={200}
              className={inputClass}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
              Track
              <select
                value={trackId}
                disabled={pending}
                onChange={(formEvent) => setTrackId(formEvent.target.value)}
                className={inputClass}
              >
                <option value="">Event-wide</option>
                {tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
              Amount (USD)
              <input
                type="number"
                required
                min={0}
                step={1}
                value={cashValue}
                disabled={pending}
                onChange={(formEvent) => setCashValue(formEvent.target.value)}
                placeholder="5000"
                className={inputClass}
              />
            </label>
          </div>
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
              {pending ? 'Saving…' : editingId ? 'Save prize' : 'Add prize'}
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
