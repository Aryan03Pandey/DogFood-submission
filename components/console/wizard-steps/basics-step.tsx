import { Field } from '@/components/console/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { slugifyTitle, type WizardData, type WizardFormat } from '@/src/lib/event-creation'

// Step 2 — basics. The slug derives itself from the title (shown, still
// editable until creation) and locks once the shell exists as the stable
// public identifier. Location fields appear for offline/hybrid formats;
// online events clear them on save.
export function BasicsStep({
  data,
  slugLocked,
  disabled,
  liveLocked,
  onPatch,
}: {
  data: WizardData
  slugLocked: boolean
  disabled?: boolean
  liveLocked?: boolean
  onPatch: (patch: Partial<WizardData>) => void
}) {
  const showLocation = data.format !== 'ONLINE'
  return (
    <div className="flex flex-col gap-4">
      {liveLocked && (
        <p className="rounded-lg bg-muted p-3 text-[12px] font-semibold text-muted-foreground">
          Only the title is frozen here — format, location, and website can still change.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="wiz-title" label="Title">
          <Input
            id="wiz-title"
            required
            value={data.title}
            disabled={disabled || liveLocked}
            maxLength={200}
            placeholder="Dogfood 2027"
            onChange={(event) => {
              const title = event.target.value
              // Auto-slug while untouched: an empty slug, or one that still
              // matches the previous title, follows the new title.
              const patch: Partial<WizardData> = { title }
              if (!slugLocked && (data.slug === '' || data.slug === slugifyTitle(data.title))) {
                patch.slug = slugifyTitle(title)
              }
              onPatch(patch)
            }}
          />
        </Field>
        <Field
          id="wiz-slug"
          label="Slug"
          hint={
            slugLocked
              ? 'Slugs cannot change after creation.'
              : 'Filled in from the title — tweak it if you like.'
          }
        >
          <Input
            id="wiz-slug"
            required
            value={data.slug}
            disabled={disabled || slugLocked}
            maxLength={120}
            placeholder="dogfood-2027"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            onChange={(event) => onPatch({ slug: event.target.value })}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="wiz-website" label="Website URL" optional>
          <Input
            id="wiz-website"
            type="url"
            value={data.websiteUrl}
            disabled={disabled}
            maxLength={500}
            placeholder="https://example.org"
            onChange={(event) => onPatch({ websiteUrl: event.target.value })}
          />
        </Field>
        <Field id="wiz-format" label="Format">
          <Select
            value={data.format}
            items={{ ONLINE: 'Online', OFFLINE: 'Offline', HYBRID: 'Hybrid' }}
            disabled={disabled}
            onValueChange={(value) => onPatch({ format: value as WizardFormat })}
          >
            <SelectTrigger id="wiz-format">
              <SelectValue placeholder="Select format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ONLINE">Online</SelectItem>
              <SelectItem value="OFFLINE">Offline</SelectItem>
              <SelectItem value="HYBRID">Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      {showLocation && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
          <Field id="wiz-location-name" label="Location name">
            <Input
              id="wiz-location-name"
              required
              value={data.locationName}
              disabled={disabled}
              maxLength={200}
              placeholder="City Convention Hall"
              onChange={(event) => onPatch({ locationName: event.target.value })}
            />
          </Field>
          <Field id="wiz-location-address" label="Full address" optional>
            <Input
              id="wiz-location-address"
              value={data.locationAddress}
              disabled={disabled}
              maxLength={500}
              placeholder="123 Main St, Springfield"
              onChange={(event) => onPatch({ locationAddress: event.target.value })}
            />
          </Field>
          <Field id="wiz-maps-url" label="Google Maps link" optional>
            <Input
              id="wiz-maps-url"
              type="url"
              value={data.mapsUrl}
              disabled={disabled}
              maxLength={500}
              placeholder="https://maps.google.com/…"
              onChange={(event) => onPatch({ mapsUrl: event.target.value })}
            />
          </Field>
        </div>
      )}
    </div>
  )
}
