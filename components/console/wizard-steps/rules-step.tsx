import { Counter } from '@/components/console/counter'
import { Field } from '@/components/console/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { WizardAudience, WizardData, WizardParticipation } from '@/src/lib/event-creation'

// Step 6 — participation and team rules. Individual events ignore the size
// bounds; team bounds are counters per spec.
export function RulesStep({
  data,
  disabled,
  liveLocked,
  onPatch,
}: {
  data: WizardData
  disabled?: boolean
  liveLocked?: boolean
  onPatch: (patch: Partial<WizardData>) => void
}) {
  const team = data.participationType === 'TEAM'
  const locked = disabled || liveLocked
  return (
    <div className="flex flex-col gap-4">
      {liveLocked && (
        <p className="rounded-lg bg-muted p-3 text-[12px] font-semibold text-muted-foreground">
          Participation rules cannot change once the event is live.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="wiz-participation" label="Participation">
          <Select
            value={data.participationType}
            items={{ TEAM: 'Team participation', INDIVIDUAL: 'Individual participation' }}
            disabled={locked}
            onValueChange={(value) => onPatch({ participationType: value as WizardParticipation })}
          >
            <SelectTrigger id="wiz-participation">
              <SelectValue placeholder="Select participation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TEAM">Team participation</SelectItem>
              <SelectItem value="INDIVIDUAL">Individual participation</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field id="wiz-audience" label="Who can participate">
          <Select
            value={data.audience}
            items={{ OPEN: 'Open to all', STUDENT: 'Students', PROFESSIONAL: 'Professionals' }}
            disabled={locked}
            onValueChange={(value) => onPatch({ audience: value as WizardAudience })}
          >
            <SelectTrigger id="wiz-audience">
              <SelectValue placeholder="Select audience" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPEN">Open to all</SelectItem>
              <SelectItem value="STUDENT">Students</SelectItem>
              <SelectItem value="PROFESSIONAL">Professionals</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="wiz-min-team" label="Minimum team size" hint={team ? undefined : 'Not used for individuals.'}>
          <Counter
            id="wiz-min-team"
            value={data.minTeamSize}
            min={1}
            max={data.maxTeamSize}
            disabled={locked || !team}
            onChange={(minTeamSize) => onPatch({ minTeamSize })}
          />
        </Field>
        <Field id="wiz-max-team" label="Maximum team size" hint={team ? undefined : 'Not used for individuals.'}>
          <Counter
            id="wiz-max-team"
            value={data.maxTeamSize}
            min={Math.max(1, data.minTeamSize)}
            disabled={locked || !team}
            onChange={(maxTeamSize) => onPatch({ maxTeamSize })}
          />
        </Field>
      </div>
    </div>
  )
}
