import { DateTimeField } from '@/components/console/date-time-field'
import { Switch } from '@/components/ui/switch'
import type { WizardData } from '@/src/lib/event-creation'

// Step 5 — timeline. Turning public voting off clears its dates (the API
// stores nulls); turning it back on starts blank again.
export function TimelineStep({
  data,
  disabled,
  onPatch,
}: {
  data: WizardData
  disabled?: boolean
  onPatch: (patch: Partial<WizardData>) => void
}) {
  function toggleVoting(next: boolean) {
    onPatch(
      next
        ? { votingEnabled: true }
        : { votingEnabled: false, publicVotingStart: null, publicVotingEndTime: null },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4">
        <DateTimeField
          id="wiz-reg-end"
          label="Registration end"
          value={data.registrationEnd}
          required
          disabled={disabled}
          hint="Sign-ups close; the event opens for registration at go-live."
          onChange={(registrationEnd) => onPatch({ registrationEnd })}
        />
        <DateTimeField
          id="wiz-sub-start"
          label="Submission start"
          value={data.submissionStart}
          disabled={disabled}
          onChange={(submissionStart) => onPatch({ submissionStart })}
        />
        <DateTimeField
          id="wiz-sub-end"
          label="Submission end"
          value={data.submissionDeadline}
          required
          disabled={disabled}
          onChange={(submissionDeadline) => onPatch({ submissionDeadline })}
        />
        <DateTimeField
          id="wiz-judge-start"
          label="Judging start"
          value={data.judgingStart}
          disabled={disabled}
          onChange={(judgingStart) => onPatch({ judgingStart })}
        />
        <DateTimeField
          id="wiz-judge-end"
          label="Judging end"
          value={data.judgingEndTime}
          required
          disabled={disabled}
          onChange={(judgingEndTime) => onPatch({ judgingEndTime })}
        />
      </div>
      <label
        htmlFor="wiz-voting"
        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
      >
        <span>
          <span className="block text-[13px] font-bold text-foreground">Public voting</span>
          <span className="block text-[11px] text-muted-foreground">
            Community votes decide community favorites.
          </span>
        </span>
        <Switch id="wiz-voting" checked={data.votingEnabled} disabled={disabled} onCheckedChange={toggleVoting} />
      </label>
      {data.votingEnabled && (
        <div className="grid gap-4">
          <DateTimeField
            id="wiz-vote-start"
            label="Voting start"
            value={data.publicVotingStart}
            disabled={disabled}
            onChange={(publicVotingStart) => onPatch({ publicVotingStart })}
          />
          <DateTimeField
            id="wiz-vote-end"
            label="Voting end"
            value={data.publicVotingEndTime}
            required
            disabled={disabled}
            onChange={(publicVotingEndTime) => onPatch({ publicVotingEndTime })}
          />
        </div>
      )}
      <DateTimeField
        id="wiz-announce"
        label="Result announcement date"
        value={data.announcementDate}
        disabled={disabled}
        onChange={(announcementDate) => onPatch({ announcementDate })}
      />
    </div>
  )
}
