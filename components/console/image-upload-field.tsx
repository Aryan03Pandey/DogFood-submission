'use client'

import { useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'

import { Field } from '@/components/console/field'
import { UPLOAD_DIMENSION_HINTS, uploadErrorFor, type UploadSlot } from '@/src/lib/upload'

// One upload slot (logo / banner / card). Picking a file only holds it in
// the browser (local preview via the parent); nothing is uploaded until the
// wizard saves. The parent owns pending files via onSelectFile and flushes
// them on Save as Draft / Save and Next / Save and Preview.
export function ImageUploadField({
  slot,
  label,
  value,
  localPreview,
  disabled,
  onSelectFile,
  onClear,
}: {
  slot: UploadSlot
  label: string
  value: string | null
  localPreview: string | null
  disabled?: boolean
  onSelectFile: (slot: UploadSlot, file: File) => void
  onClear: (slot: UploadSlot) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const preview = localPreview ?? value

  function onPick(file: File | undefined) {
    if (!file || disabled) return
    const rejected = uploadErrorFor({ mime: file.type, sizeBytes: file.size, filename: file.name })
    if (rejected === 'UNSUPPORTED_TYPE') {
      setError('Only PNG, JPEG, WebP, GIF, and SVG images are accepted.')
      return
    }
    if (rejected === 'TOO_LARGE') {
      setError('Images must be 5 MB or smaller.')
      return
    }
    if (rejected) {
      setError('Could not read that file.')
      return
    }
    setError(null)
    onSelectFile(slot, file)
  }

  return (
    <Field
      id={`${slot}-upload`}
      label={label}
      hint={UPLOAD_DIMENSION_HINTS[slot]}
      error={error}
      optional
    >
      <div className="flex items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className="size-16 shrink-0 rounded-xl border border-border object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground"
          >
            <ImagePlus size={20} strokeWidth={1.8} />
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            {preview ? 'Replace' : 'Upload'}
          </button>
          {preview && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onClear(slot)}
              aria-label={`Remove ${label}`}
              className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-60"
            >
              <X size={15} strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        id={`${slot}-upload`}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        disabled={disabled}
        onChange={(event) => {
          onPick(event.target.files?.[0])
          event.target.value = ''
        }}
        className="sr-only"
      />
    </Field>
  )
}
