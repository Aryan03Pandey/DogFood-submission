'use client'

import { Plus, Trash2 } from 'lucide-react'

import { Field } from '@/components/console/field'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { PrizeKind, PrizeTierInput, WizardData } from '@/src/lib/event-creation'
import type { TrackPayload } from '@/lib/api-client'

// Step 7 — prize tiers plus the participation certificate. Certificate tiers
// carry no amount or currency. Nothing here persists until the step saves:
// tiers sync to the prizes API (create / update / delete) alongside the
// certificate flag.
export function PrizesStep({
  data,
  tracks,
  disabled,
  liveLocked,
  onAddTier,
  onPatchTier,
  onRemoveTier,
  onPatch,
}: {
  data: WizardData
  tracks: TrackPayload[]
  disabled?: boolean
  liveLocked?: boolean
  onAddTier: () => void
  onPatchTier: (key: string, patch: Partial<PrizeTierInput>) => void
  onRemoveTier: (key: string) => void
  onPatch: (patch: Partial<WizardData>) => void
}) {
  const locked = disabled || liveLocked
  return (
    <div className="flex flex-col gap-4">
      {liveLocked && (
        <p className="rounded-lg bg-muted p-3 text-[12px] font-semibold text-muted-foreground">
          Prizes cannot change once the event is live.
        </p>
      )}
      {data.tiers.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-6 text-[13px] text-muted-foreground">
          No reward tiers yet. Add the first one below.
        </p>
      )}
      {data.tiers.map((tier, index) => (
        <fieldset
          key={tier.key}
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"
        >
          <div className="flex items-center justify-between">
            <legend className="px-1 text-[13px] font-bold text-foreground">
              Reward {index + 1}
            </legend>
            <button
              type="button"
              onClick={() => onRemoveTier(tier.key)}
              disabled={locked}
              aria-label={`Remove reward ${index + 1}`}
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-60"
            >
              <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          <Field id={`tier-title-${tier.key}`} label="Title">
            <Input
              id={`tier-title-${tier.key}`}
              required
              value={tier.title}
              disabled={locked}
              maxLength={200}
              placeholder="Grand prize"
              onChange={(event) => onPatchTier(tier.key, { title: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`tier-kind-${tier.key}`} label="Type">
              <Select
                value={tier.kind}
                items={{ MONETARY: 'Monetary', IN_KIND: 'In-kind', CERTIFICATE: 'Certificate' }}
                disabled={locked}
                onValueChange={(value) => onPatchTier(tier.key, { kind: value as PrizeKind })}
              >
                <SelectTrigger id={`tier-kind-${tier.key}`}>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONETARY">Monetary</SelectItem>
                  <SelectItem value="IN_KIND">In-kind</SelectItem>
                  <SelectItem value="CERTIFICATE">Certificate</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id={`tier-track-${tier.key}`} label="Track" optional>
              <Select
                value={tier.trackId === '' ? 'event-wide' : tier.trackId}
                items={{
                  'event-wide': 'Event-wide',
                  ...Object.fromEntries(tracks.map((track) => [track.id, track.name])),
                }}
                disabled={locked || tracks.length === 0}
                onValueChange={(value) =>
                  onPatchTier(tier.key, { trackId: value == null || value === 'event-wide' ? '' : value })
                }
              >
                <SelectTrigger id={`tier-track-${tier.key}`}>
                  <SelectValue placeholder={tracks.length === 0 ? 'No tracks yet' : 'Event-wide'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="event-wide">Event-wide</SelectItem>
                  {tracks.map((track) => (
                    <SelectItem key={track.id} value={track.id}>
                      {track.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {tier.kind !== 'CERTIFICATE' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id={`tier-amount-${tier.key}`} label="Amount">
                <Input
                  id={`tier-amount-${tier.key}`}
                  type="number"
                  required
                  min={0}
                  step={1}
                  value={tier.amount}
                  disabled={locked}
                  placeholder="5000"
                  onChange={(event) => onPatchTier(tier.key, { amount: event.target.value })}
                />
              </Field>
              <Field id={`tier-currency-${tier.key}`} label="Currency">
                <Input
                  id={`tier-currency-${tier.key}`}
                  required
                  value={tier.currency}
                  disabled={locked}
                  maxLength={3}
                  placeholder="USD"
                  onChange={(event) => onPatchTier(tier.key, { currency: event.target.value })}
                />
              </Field>
            </div>
          )}
        </fieldset>
      ))}

      <div>
        <button
          type="button"
          onClick={onAddTier}
          disabled={locked}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <Plus size={16} strokeWidth={1.8} aria-hidden="true" /> Add reward
        </button>
      </div>

      <label
        htmlFor="wiz-certificate"
        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
      >
        <span>
          <span className="block text-[13px] font-bold text-foreground">Participation certificates</span>
          <span className="block text-[11px] text-muted-foreground">
            Every hacker receives a certificate.
          </span>
        </span>
        <Switch
          id="wiz-certificate"
          checked={data.participationCertificate}
          disabled={locked}
          onCheckedChange={(checked) => onPatch({ participationCertificate: checked })}
        />
      </label>

      <label
        htmlFor="wiz-acknowledged"
        className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-4 py-3"
      >
        <Checkbox
          id="wiz-acknowledged"
          checked={data.acknowledged}
          disabled={locked}
          onCheckedChange={(checked) => onPatch({ acknowledged: checked === true })}
          className="mt-0.5"
        />
        <span className="text-[12px] leading-5 text-muted-foreground">
          I understand that prize amounts and participation certificate settings will not change
          once the event goes live.
        </span>
      </label>
    </div>
  )
}
