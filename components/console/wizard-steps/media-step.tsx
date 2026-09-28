import { ImageUploadField } from '@/components/console/image-upload-field'
import type { UploadSlot } from '@/src/lib/upload'

// Step 1 — event imagery. Picked files stay in the browser (local previews)
// until the wizard saves; the parent flushes them on Save as Draft / Save
// and Next / Save and Preview.
export function MediaStep({
  logoUrl,
  bannerUrl,
  cardBannerUrl,
  localPreviews,
  disabled,
  onSelectFile,
  onClear,
}: {
  logoUrl: string | null
  bannerUrl: string | null
  cardBannerUrl: string | null
  localPreviews: Record<UploadSlot, string | null>
  disabled?: boolean
  onSelectFile: (slot: UploadSlot, file: File) => void
  onClear: (slot: UploadSlot) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <ImageUploadField
        slot="logo"
        label="Logo"
        value={logoUrl}
        localPreview={localPreviews.logo}
        disabled={disabled}
        onSelectFile={onSelectFile}
        onClear={onClear}
      />
      <ImageUploadField
        slot="banner"
        label="Banner"
        value={bannerUrl}
        localPreview={localPreviews.banner}
        disabled={disabled}
        onSelectFile={onSelectFile}
        onClear={onClear}
      />
      <ImageUploadField
        slot="card"
        label="Event card banner"
        value={cardBannerUrl}
        localPreview={localPreviews.card}
        disabled={disabled}
        onSelectFile={onSelectFile}
        onClear={onClear}
      />
    </div>
  )
}
