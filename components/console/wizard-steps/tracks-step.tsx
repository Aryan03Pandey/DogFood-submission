'use client'

import { Plus, Trash2 } from 'lucide-react'

import { Field } from '@/components/console/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { MAX_TRACK_DESCRIPTION_LENGTH, type TrackInput, type WizardData } from '@/src/lib/event-creation'

// Tracks step — right after description. Tracks are optional (zero is
// fine); each added track has a title and a short description capped at 200
// characters. Nothing here persists until the step saves: tracks sync to the
// tracks API (create / update / delete).
export function TracksStep({
  data,
  disabled,
  liveLocked,
  onAddTrack,
  onPatchTrack,
  onRemoveTrack,
}: {
  data: WizardData
  disabled?: boolean
  liveLocked?: boolean
  onAddTrack: () => void
  onPatchTrack: (key: string, patch: Partial<TrackInput>) => void
  onRemoveTrack: (key: string) => void
}) {
  const locked = disabled || liveLocked
  return (
    <div className="flex flex-col gap-4">
      {liveLocked && (
        <p className="rounded-lg bg-muted p-3 text-[12px] font-semibold text-muted-foreground">
          Tracks cannot change once the event is live.
        </p>
      )}
      {data.tracks.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-6 text-[13px] text-muted-foreground">
          No tracks yet. Tracks are optional — add the first one below if this event has any.
        </p>
      )}
      {data.tracks.map((track, index) => (
        <fieldset
          key={track.key}
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"
        >
          <div className="flex items-center justify-between">
            <legend className="px-1 text-[13px] font-bold text-foreground">
              Track {index + 1}
            </legend>
            <button
              type="button"
              onClick={() => onRemoveTrack(track.key)}
              disabled={locked}
              aria-label={`Remove track ${index + 1}`}
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-60"
            >
              <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          <Field id={`track-name-${track.key}`} label="Title">
            <Input
              id={`track-name-${track.key}`}
              required
              value={track.name}
              disabled={locked}
              maxLength={200}
              placeholder="AI for Good"
              onChange={(event) => onPatchTrack(track.key, { name: event.target.value })}
            />
          </Field>
          <Field
            id={`track-description-${track.key}`}
            label="Short description"
            hint={`${track.description.length}/${MAX_TRACK_DESCRIPTION_LENGTH} characters`}
            optional
          >
            <Textarea
              id={`track-description-${track.key}`}
              value={track.description}
              disabled={locked}
              rows={3}
              maxLength={MAX_TRACK_DESCRIPTION_LENGTH}
              placeholder="What belongs in this track?"
              onChange={(event) => onPatchTrack(track.key, { description: event.target.value })}
            />
          </Field>
        </fieldset>
      ))}

      <div>
        <button
          type="button"
          onClick={onAddTrack}
          disabled={locked}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <Plus size={16} strokeWidth={1.8} aria-hidden="true" /> Add track
        </button>
      </div>
    </div>
  )
}
