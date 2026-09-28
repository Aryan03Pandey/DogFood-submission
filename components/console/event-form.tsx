'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError, apiCreateEvent, apiUpdateEvent, type EventPayload, validationDetailsMessage } from '@/lib/api-client'

const DATE_FIELDS = [
  { key: 'registrationEnd', label: 'Registration end', required: true },
  { key: 'submissionStart', label: 'Submission start', required: false },
  { key: 'submissionDeadline', label: 'Submission deadline', required: true },
  { key: 'judgingStart', label: 'Judging start', required: false },
  { key: 'judgingEndTime', label: 'Judging end', required: true },
  { key: 'publicVotingStart', label: 'Public voting start', required: false },
  { key: 'publicVotingEndTime', label: 'Public voting end', required: true },
] as const

type DateKey = (typeof DATE_FIELDS)[number]['key']

function toInputValue(iso: string | null): string {
  return iso == null ? '' : iso.slice(0, 16)
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'SLUG_TAKEN') return 'That slug is already in use.'
    if (error.code === 'VALIDATION_ERROR')
      return validationDetailsMessage(error) ?? 'Check the highlighted schedule: dates must run forward in time.'
    if (error.code === 'FORBIDDEN') return 'This event is locked: schedule edits are DRAFT-only.'
    if (error.code === 'NETWORK_ERROR') return 'Save failed. Is the server running?'
  }
  return 'Save failed. Try again.'
}

// Shared create/edit form for organizer events. In edit mode past DRAFT the
// service refuses every patch, so the form renders locked with a notice.
export default function EventForm({
  mode,
  event,
  locked,
}: {
  mode: 'create' | 'edit'
  event?: EventPayload
  locked?: boolean
}) {
  const router = useRouter()
  const [title, setTitle] = useState(event?.title ?? '')
  const [slug, setSlug] = useState(event?.slug ?? '')
  const [dates, setDates] = useState<Record<DateKey, string>>(() => ({
    registrationEnd: toInputValue(event?.registrationEnd ?? null),
    submissionStart: toInputValue(event?.submissionStart ?? null),
    submissionDeadline: toInputValue(event?.submissionDeadline ?? null),
    judgingStart: toInputValue(event?.judgingStart ?? null),
    judgingEndTime: toInputValue(event?.judgingEndTime ?? null),
    publicVotingStart: toInputValue(event?.publicVotingStart ?? null),
    publicVotingEndTime: toInputValue(event?.publicVotingEndTime ?? null),
  }))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function setDate(key: DateKey, value: string) {
    setDates((prev) => ({ ...prev, [key]: value }))
  }

  async function onSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault()
    setError(null)
    setPending(true)
    try {
      const payload = {
        title: title.trim(),
        ...(mode === 'create' ? { slug: slug.trim() } : {}),
        ...Object.fromEntries(
          DATE_FIELDS.map(({ key }) => [key, dates[key] === '' ? undefined : dates[key]]),
        ),
      }
      if (mode === 'create') {
        const created = await apiCreateEvent(
          payload as { title: string; slug: string; registrationEnd: string; submissionDeadline: string; judgingEndTime: string; publicVotingEndTime: string },
        )
        router.push(`/console?eventId=${created.id}`)
        router.refresh()
      } else if (event) {
        await apiUpdateEvent(event.id, payload)
        router.refresh()
      }
    } catch (submitError) {
      setError(errorMessage(submitError))
    } finally {
      setPending(false)
    }
  }

  const inputClass =
    'h-10 rounded-lg border border-border bg-background px-3 text-[13px] outline-none placeholder:text-muted-foreground focus:border-[#16a34a] disabled:opacity-60'

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {mode === 'edit' && locked === true && (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-[12px] font-semibold text-muted-foreground">
          This event has left DRAFT, so its schedule is locked.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
          Title
          <input
            required
            value={title}
            disabled={locked === true || pending}
            onChange={(formEvent) => setTitle(formEvent.target.value)}
            placeholder="Dogfood 2027"
            maxLength={200}
            className={inputClass}
          />
        </label>
        {mode === 'create' && (
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
            Slug
            <input
              required
              value={slug}
              disabled={pending}
              onChange={(formEvent) => setSlug(formEvent.target.value)}
              placeholder="dogfood-2027"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              title="Lowercase letters, numbers, and hyphens"
              className={inputClass}
            />
          </label>
        )}
      </div>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Phase schedule
        </legend>
        {DATE_FIELDS.map(({ key, label, required }) => (
          <label key={key} className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
            {label}
            <input
              type="datetime-local"
              required={required}
              value={dates[key]}
              disabled={locked === true || pending}
              onChange={(formEvent) => setDate(key, formEvent.target.value)}
              className={inputClass}
            />
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}
      <div>
        <button
          type="submit"
          disabled={pending || locked === true}
          className="inline-flex h-10 items-center rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
        >
          {pending ? 'Saving…' : mode === 'create' ? 'Create event' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
