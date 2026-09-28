import { Field } from '@/components/console/field'
import { RichTextEditor } from '@/components/console/rich-text-editor'
import type { WizardData } from '@/src/lib/event-creation'

// Step 3 — description. HTML is produced by the editor and sanitized again
// at the API boundary; the preview renders the draft verbatim.
export function DescriptionStep({
  data,
  disabled,
  onPatch,
}: {
  data: WizardData
  disabled?: boolean
  onPatch: (patch: Partial<WizardData>) => void
}) {
  return (
    <Field
      id="wiz-description"
      label="Event description"
      hint="Formatting and links carry over to the event page."
      optional
    >
      <RichTextEditor
        label="Event description"
        value={data.descriptionHtml}
        disabled={disabled}
        onChange={(descriptionHtml) => onPatch({ descriptionHtml })}
      />
    </Field>
  )
}
