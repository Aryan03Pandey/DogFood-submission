'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  ApiError,
  apiCreateEvent,
  apiCreatePrize,
  apiCreateTrack,
  apiDeletePrize,
  apiDeleteTrack,
  apiUpdateEvent,
  apiUpdatePrize,
  apiUpdateTrack,
  type TrackPayload,
  validationDetailsMessage,
} from '@/lib/api-client'
import { uploadImageFile } from '@/components/console/upload-image'
import { EventPreview } from '@/components/console/event-preview'
import { BasicsStep } from '@/components/console/wizard-steps/basics-step'
import { DescriptionStep } from '@/components/console/wizard-steps/description-step'
import { MediaStep } from '@/components/console/wizard-steps/media-step'
import { PrizesStep } from '@/components/console/wizard-steps/prizes-step'
import { RulesStep } from '@/components/console/wizard-steps/rules-step'
import { TimelineStep } from '@/components/console/wizard-steps/timeline-step'
import { TracksStep } from '@/components/console/wizard-steps/tracks-step'
import {
  emptyWizard,
  timelinePayload,
  validateBasics,
  validatePrizes,
  validateRules,
  validateTimeline,
  validateTracks,
  WIZARD_STEPS,
  type PrizeTierInput,
  type TrackInput,
  type WizardData,
  type WizardStepId,
} from '@/src/lib/event-creation'
import type { UploadSlot } from '@/src/lib/upload'

function saveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'SLUG_TAKEN') return 'That slug is already in use.'
    if (error.code === 'VALIDATION_ERROR')
      return validationDetailsMessage(error) ?? 'The server rejected the data. Check the fields and try again.'
    if (error.code === 'FORBIDDEN') return 'You cannot edit this event.'
    if (error.code === 'PRIZE_LOCKED') return 'Prizes cannot change once the event is live.'
    if (error.code === 'LIVE_EDIT_LOCKED')
      return 'That change is locked once live — only the description, location, format, website, media, and future dates can change.'
    if (error.code === 'NETWORK_ERROR') return 'Save failed. Is the server running?'
  }
  return 'Save failed. Try again.'
}

// Six-step creation wizard (EVENT-CREATION.md): accordion steps on the
// left, live preview on the right (desktop only). The DRAFT shell is created
// at Basics; every later save PATCHes it. Media files stay in the browser
// until a save (Save as Draft / Save and Next / Save and Preview flushes
// them, whatever step triggered it).
export function EventWizard({
  tracks,
  mode = 'create',
  initial,
  live = false,
}: {
  tracks: TrackPayload[]
  mode?: 'create' | 'edit'
  initial?: WizardData
  live?: boolean
}) {
  const router = useRouter()
  const editMode = mode === 'edit'
  // Live events freeze titles, slugs, rules, tracks, and prizes; only the
  // editable subset (description, location, format, media, future dates)
  // stays interactive. The server re-checks every save regardless.
  const liveLocked = editMode && live
  const [data, setData] = useState<WizardData>(initial ?? emptyWizard())
  const [stepIndex, setStepIndex] = useState(0)
  const [visited, setVisited] = useState<ReadonlySet<number>>(new Set([0]))
  const [pendingFiles, setPendingFiles] = useState<Record<UploadSlot, File | null>>({
    logo: null,
    banner: null,
    card: null,
  })
  const [localPreviews, setLocalPreviews] = useState<Record<UploadSlot, string | null>>({
    logo: null,
    banner: null,
    card: null,
  })
  const [removedTierIds, setRemovedTierIds] = useState<string[]>([])
  const [removedTrackIds, setRemovedTrackIds] = useState<string[]>([])
  const [stepErrors, setStepErrors] = useState<string[]>([])
  const [apiError, setApiError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const tierCounter = useRef(0)
  const trackCounter = useRef(0)

  const step: WizardStepId = WIZARD_STEPS[stepIndex].id
  const isLast = stepIndex === WIZARD_STEPS.length - 1
  // Prize assignment sees server tracks plus wizard tracks once saved
  // (only persisted tracks have ids the prizes API accepts).
  const allTracks = useMemo<TrackPayload[]>(() => {
    const local: TrackPayload[] = data.tracks
      .filter((track) => track.id != null)
      .map((track) => ({
        id: track.id as string,
        eventId: data.eventId ?? '',
        name: track.name,
        description: track.description === '' ? null : track.description,
        eligibilityRules: {},
      }))
    return [...tracks, ...local.filter((track) => !tracks.some((known) => known.id === track.id))]
  }, [tracks, data.tracks, data.eventId])
  const trackNames = useMemo(() => {
    const names: Record<string, string> = {}
    for (const track of allTracks) names[track.id] = track.name
    return names
  }, [allTracks])
  // The preview shows local picks instantly: pending files live only in
  // localPreviews (blob URLs) until a save persists them into data.
  const previewData = useMemo(
    () => ({
      ...data,
      logoUrl: localPreviews.logo ?? data.logoUrl,
      bannerUrl: localPreviews.banner ?? data.bannerUrl,
      cardBannerUrl: localPreviews.card ?? data.cardBannerUrl,
    }),
    [data, localPreviews],
  )
  const dateRange = useMemo(() => {
    if (!data.registrationEnd || !data.submissionDeadline) return null
    const fmt = (iso: string) =>
      new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    return `${fmt(data.registrationEnd)} – ${fmt(data.submissionDeadline)}`
  }, [data.registrationEnd, data.submissionDeadline])

  function onPatch(patch: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...patch }))
    setSavedFlash(false)
  }

  function onSelectFile(slot: UploadSlot, file: File) {
    setPendingFiles((prev) => {
      if (prev[slot]) URL.revokeObjectURL(localPreviews[slot] ?? '')
      return { ...prev, [slot]: file }
    })
    setLocalPreviews((prev) => ({ ...prev, [slot]: URL.createObjectURL(file) }))
  }

  // Clears stay local like picks: the null persists on the next save.
  function clearSlot(slot: UploadSlot, urlKey: 'logoUrl' | 'bannerUrl' | 'cardBannerUrl') {
    setPendingFiles((prev) => ({ ...prev, [slot]: null }))
    setLocalPreviews((prev) => {
      if (prev[slot]) URL.revokeObjectURL(prev[slot] as string)
      return { ...prev, [slot]: null }
    })
    onPatch({ [urlKey]: null } as Partial<WizardData>)
  }

  function onAddTier() {
    tierCounter.current += 1
    const tier: PrizeTierInput = {
      key: `tier-${Date.now()}-${tierCounter.current}`,
      title: '',
      kind: 'MONETARY',
      amount: '',
      currency: 'USD',
      trackId: '',
    }
    onPatch({ tiers: [...data.tiers, tier] })
  }

  function onPatchTier(key: string, patch: Partial<PrizeTierInput>) {
    onPatch({ tiers: data.tiers.map((tier) => (tier.key === key ? { ...tier, ...patch } : tier)) })
  }

  function onRemoveTier(key: string) {
    const tier = data.tiers.find((t) => t.key === key)
    if (tier?.id) setRemovedTierIds((prev) => [...prev, tier.id as string])
    onPatch({ tiers: data.tiers.filter((t) => t.key !== key) })
  }

  function onAddTrack() {
    trackCounter.current += 1
    const track: TrackInput = {
      key: `track-${Date.now()}-${trackCounter.current}`,
      name: '',
      description: '',
    }
    onPatch({ tracks: [...data.tracks, track] })
  }

  function onPatchTrack(key: string, patch: Partial<TrackInput>) {
    onPatch({ tracks: data.tracks.map((track) => (track.key === key ? { ...track, ...patch } : track)) })
  }

  function onRemoveTrack(key: string) {
    const track = data.tracks.find((t) => t.key === key)
    if (track?.id) {
      setRemovedTrackIds((prev) => [...prev, track.id as string])
      // Tiers assigned to a deleted track fall back to event-wide.
      onPatch({
        tiers: data.tiers.map((tier) =>
          tier.trackId === track.id ? { ...tier, trackId: '' } : tier,
        ),
      })
    }
    onPatch({ tracks: data.tracks.filter((t) => t.key !== key) })
  }

  function validateStep(id: WizardStepId): string[] {
    switch (id) {
      case 'media':
        return []
      case 'basics':
        return validateBasics(data)
      case 'description':
        return []
      case 'tracks':
        return validateTracks(data)
      case 'timeline':
        return validateTimeline(data)
      case 'rules':
        return validateRules(data)
      case 'prizes':
        return validatePrizes(data)
    }
  }

  async function flushPendingFiles(eventId: string): Promise<Record<UploadSlot, string | null> | null> {
    const next: Record<UploadSlot, string | null> = {
      logo: data.logoUrl,
      banner: data.bannerUrl,
      card: data.cardBannerUrl,
    }
    for (const slot of ['logo', 'banner', 'card'] as const) {
      const file = pendingFiles[slot]
      if (!file) continue
      const result = await uploadImageFile(file, eventId, slot)
      if ('error' in result) {
        setApiError(
          result.error === 'TOO_LARGE'
            ? 'Images must be 5 MB or smaller.'
            : result.error === 'FORBIDDEN'
              ? 'You cannot upload images for this event.'
              : 'An image upload failed. Try again.',
        )
        return null
      }
      next[slot] = result.url
    }
    return next
  }

  async function ensureShell(): Promise<string | null> {
    if (data.eventId) return data.eventId
    const problems = validateBasics(data)
    if (problems.length > 0) {
      // Guide, don't scold: jump to basics with a clean slate. The errors
      // appear when the user tries to continue or save from there.
      setStepErrors([])
      setStepIndex(WIZARD_STEPS.findIndex((entry) => entry.id === 'basics'))
      return null
    }
    try {
      const created = await apiCreateEvent({ title: data.title.trim(), slug: data.slug.trim() })
      return created.id
    } catch (error) {
      setApiError(saveErrorMessage(error))
      return null
    }
  }

  async function saveMediaUrls(eventId: string): Promise<boolean> {
    const urls = await flushPendingFiles(eventId)
    if (!urls) return false
    await apiUpdateEvent(eventId, {
      logoUrl: urls.logo,
      bannerUrl: urls.banner,
      cardBannerUrl: urls.card,
    })
    onPatch({ logoUrl: urls.logo, bannerUrl: urls.banner, cardBannerUrl: urls.card })
    setPendingFiles({ logo: null, banner: null, card: null })
    setLocalPreviews({ logo: null, banner: null, card: null })
    return true
  }

  async function saveStep(id: WizardStepId, eventId: string): Promise<boolean> {
    try {
      // Live events freeze rules, tracks, and prizes, so those syncs are
      // skipped outright — the inputs are disabled, nothing could differ,
      // and the APIs would 403/409 the writes anyway.
      if (liveLocked && (id === 'rules' || id === 'tracks' || id === 'prizes')) return true
      if (id === 'media') return saveMediaUrls(eventId)
      if (id === 'basics') {
        const online = data.format === 'ONLINE'
        // Live mode drops the frozen title: the server rejects it.
        await apiUpdateEvent(eventId, {
          ...(liveLocked
            ? {}
            : {
                title: data.title.trim(),
              }),
          websiteUrl: data.websiteUrl.trim() === '' ? null : data.websiteUrl.trim(),
          format: data.format,
          locationName: online || data.locationName.trim() === '' ? null : data.locationName.trim(),
          locationAddress:
            online || data.locationAddress.trim() === '' ? null : data.locationAddress.trim(),
          mapsUrl: online || data.mapsUrl.trim() === '' ? null : data.mapsUrl.trim(),
        })
        return true
      }
      if (id === 'description') {
        await apiUpdateEvent(eventId, {
          descriptionHtml: data.descriptionHtml.trim() === '' ? null : data.descriptionHtml,
        })
        return true
      }
      if (id === 'timeline') {
        const payload = timelinePayload(data)
        await apiUpdateEvent(eventId, {
          ...payload,
          announcementDate: data.announcementDate,
        })
        return true
      }
      if (id === 'rules') {
        await apiUpdateEvent(eventId, {
          participationType: data.participationType,
          minTeamSize: data.minTeamSize,
          maxTeamSize: data.maxTeamSize,
          audience: data.audience,
        })
        return true
      }
      if (id === 'tracks') {
        const synced: TrackInput[] = []
        for (const track of data.tracks) {
          const payload = {
            name: track.name.trim(),
            description: track.description.trim() === '' ? null : track.description.trim(),
          }
          if (track.id) {
            const updated = await apiUpdateTrack(eventId, track.id, payload)
            synced.push({ ...track, id: updated.id })
          } else {
            const created = await apiCreateTrack(eventId, payload)
            synced.push({ ...track, id: created.id })
          }
        }
        for (const gone of removedTrackIds) await apiDeleteTrack(eventId, gone)
        setRemovedTrackIds([])
        onPatch({ tracks: synced })
        return true
      }
      const synced: PrizeTierInput[] = []
      for (const tier of data.tiers) {
        const payload = {
          title: tier.title.trim(),
          kind: tier.kind,
          trackId: tier.trackId === '' ? null : tier.trackId,
          cashValue: Number.parseInt(tier.amount, 10),
          currency: tier.currency.trim().toUpperCase(),
        }
        if (tier.id) {
          const updated = await apiUpdatePrize(eventId, tier.id, payload)
          synced.push({ ...tier, id: updated.id })
        } else {
          const created = await apiCreatePrize(eventId, payload)
          synced.push({ ...tier, id: created.id })
        }
      }
      for (const gone of removedTierIds) await apiDeletePrize(eventId, gone)
      setRemovedTierIds([])
      onPatch({ tiers: synced })
      await apiUpdateEvent(eventId, { participationCertificate: data.participationCertificate })
      return true
    } catch (error) {
      setApiError(saveErrorMessage(error))
      return false
    }
  }

  function renderStepContent(id: WizardStepId) {
    switch (id) {
      case 'media':
        return (
          <MediaStep
            logoUrl={data.logoUrl}
            bannerUrl={data.bannerUrl}
            cardBannerUrl={data.cardBannerUrl}
            localPreviews={localPreviews}
            disabled={saving}
            onSelectFile={onSelectFile}
            onClear={(slot) =>
              clearSlot(slot, slot === 'logo' ? 'logoUrl' : slot === 'banner' ? 'bannerUrl' : 'cardBannerUrl')
            }
          />
        )
      case 'basics':
        return (
          <BasicsStep
            data={data}
            slugLocked={data.eventId !== null}
            disabled={saving}
            liveLocked={liveLocked}
            onPatch={onPatch}
          />
        )
      case 'description':
        return <DescriptionStep data={data} disabled={saving} onPatch={onPatch} />
      case 'tracks':
        return (
          <TracksStep
            data={data}
            disabled={saving}
            liveLocked={liveLocked}
            onAddTrack={onAddTrack}
            onPatchTrack={onPatchTrack}
            onRemoveTrack={onRemoveTrack}
          />
        )
      case 'timeline':
        return <TimelineStep data={data} disabled={saving} onPatch={onPatch} />
      case 'rules':
        return <RulesStep data={data} disabled={saving} liveLocked={liveLocked} onPatch={onPatch} />
      case 'prizes':
        return (
          <PrizesStep
            data={data}
            tracks={allTracks}
            disabled={saving}
            liveLocked={liveLocked}
            onAddTier={onAddTier}
            onPatchTier={onPatchTier}
            onRemoveTier={onRemoveTier}
            onPatch={onPatch}
          />
        )
    }
  }

  // Accordion headers persist before switching: without this, input typed
  // on one step (a description, say) but never saved would silently stay
  // out of the database, and the preview page — which reads from the
  // server — would show nothing. Validation failures keep the user on the
  // current step with the errors visible.
  async function goTo(index: number) {
    if (index === stepIndex || saving) return
    setSaving(true)
    setApiError(null)
    try {
      const eventId = await persistCurrent()
      if (eventId) {
        setSavedFlash(true)
        setStepIndex(index)
        setVisited((prev) => new Set(prev).add(index))
        setStepErrors([])
        setApiError(null)
      }
    } finally {
      setSaving(false)
    }
  }

  async function persistCurrent(): Promise<string | null> {
    const problems = validateStep(step)
    setStepErrors(problems)
    if (problems.length > 0) return null
    const eventId = await ensureShell()
    if (!eventId) return null
    if (data.eventId !== eventId) onPatch({ eventId })
    // Files picked before the shell existed are still pending: flush them
    // on the first save after creation, whatever step triggered it.
    if (Object.values(pendingFiles).some((file) => file !== null)) {
      try {
        if (!(await saveMediaUrls(eventId))) return null
      } catch (error) {
        setApiError(saveErrorMessage(error))
        return null
      }
    }
    const ok = await saveStep(step, eventId)
    return ok ? eventId : null
  }

  async function onNext() {
    if (saving) return
    setSaving(true)
    setApiError(null)
    try {
      const eventId = await persistCurrent()
      if (eventId) {
        setSavedFlash(true)
        goTo(Math.min(stepIndex + 1, WIZARD_STEPS.length - 1))
      }
    } finally {
      setSaving(false)
    }
  }

  // Back is local navigation only: edits live in state (nothing is lost),
  // so stepping back never validates, never saves, and never blocks on the
  // current step's errors. The next explicit save flushes everything.
  function onBack() {
    if (saving || stepIndex === 0) return
    const prev = stepIndex - 1
    setStepIndex(prev)
    setVisited((visited) => new Set(visited).add(prev))
    setStepErrors([])
  }

  // Cancel abandons the flow without a password: everything saved so far
  // stays as a DRAFT the organizer can resume or delete (deletion itself
  // stays password-gated in the dashboard).
  function onCancel() {
    if (saving) return
    router.push('/console')
  }

  async function onDraft() {
    if (saving) return
    setSaving(true)
    setApiError(null)
    try {
      const eventId = await persistCurrent()
      if (eventId) setSavedFlash(true)
    } finally {
      setSaving(false)
    }
  }

  async function onPreview() {
    if (saving) return
    setSaving(true)
    setApiError(null)
    try {
      const eventId = await persistCurrent()
      if (eventId) router.push(`/console/events/${eventId}/preview`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {liveLocked && (
        <p role="status" className="rounded-xl border border-border bg-muted p-4 text-[12px] font-semibold text-muted-foreground">
          This event is live: titles, rules, tracks, and prizes are frozen. Only the
          description, location, format, website, media, and future dates can change.
        </p>
      )}
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
      <div>
        <div aria-label="Creation steps" className="flex flex-col gap-3">
          {WIZARD_STEPS.map((entry, index) => {
            const current = index === stepIndex
            const done = visited.has(index) && index < stepIndex
            return (
              <section
                key={entry.id}
                className={cn(
                  'overflow-hidden rounded-xl border border-border bg-card transition-colors',
                  current && 'border-[#16a34a]/60',
                )}
              >
                <button
                  type="button"
                  onClick={() => goTo(index)}
                  disabled={saving}
                  aria-expanded={current}
                  aria-controls={`wizard-panel-${entry.id}`}
                  id={`wizard-header-${entry.id}`}
                  className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 disabled:opacity-60"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold',
                      current
                        ? 'bg-[#16a34a] text-white'
                        : done
                          ? 'bg-muted text-foreground'
                          : 'border border-border text-muted-foreground',
                    )}
                  >
                    {done ? (
                      <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="text-[13px] font-bold text-foreground">{entry.label}</span>
                  {done && !current && (
                    <span className="text-[11px] font-semibold text-muted-foreground">Saved</span>
                  )}
                  <ChevronDown
                    size={16}
                    strokeWidth={2}
                    aria-hidden="true"
                    className={cn(
                      'ml-auto shrink-0 text-muted-foreground transition-transform',
                      current && 'rotate-180',
                    )}
                  />
                </button>
                {current && (
                  <div
                    id={`wizard-panel-${entry.id}`}
                    role="region"
                    aria-labelledby={`wizard-header-${entry.id}`}
                    className="border-t border-border p-4 sm:p-5"
                  >
                    {renderStepContent(entry.id)}
                  </div>
                )}
              </section>
            )
          })}
        </div>

        {stepErrors.length > 0 && (
          <div role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
            <ul className="flex flex-col gap-1">
              {stepErrors.map((message) => (
                <li key={message} className="text-[12px] font-semibold text-destructive">
                  {message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {apiError && (
          <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-[12px] font-semibold text-destructive">
            {apiError}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {editMode ? (
            <>
              <span className="flex-1" aria-hidden="true" />
              {savedFlash && (
                <span role="status" className="text-[12px] font-semibold text-[#16a34a] dark:text-[#22c55e]">
                  Saved.
                </span>
              )}
              <button
                type="button"
                onClick={onPreview}
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
              >
                Save and Preview <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </>
          ) : (
          !confirmingCancel ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmingCancel(true)}
                disabled={saving}
                className="inline-flex h-10 items-center rounded-lg px-4 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
              >
                Cancel
              </button>
              <span className="flex-1" aria-hidden="true" />
              {savedFlash && (
                <span role="status" className="text-[12px] font-semibold text-[#16a34a] dark:text-[#22c55e]">
                  Draft saved.
                </span>
              )}
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={onBack}
                  disabled={saving}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  <ArrowLeft size={15} strokeWidth={1.8} aria-hidden="true" /> Go Back
                </button>
              )}
              <button
                type="button"
                onClick={onDraft}
                disabled={saving}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save as Draft'}
              </button>
              {!isLast ? (
                <button
                  type="button"
                  onClick={onNext}
                  disabled={saving}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
                >
                  Save and Next <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onPreview}
                  disabled={saving}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
                >
                  Save and Preview <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
                </button>
              )}
            </>
          ) : (
            <div className="flex basis-full flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-4">
              <p className="basis-full text-[12px] font-semibold text-foreground">
                Leave event creation? Steps saved so far stay as a draft; unsaved input on
                this step is lost.
              </p>
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="inline-flex h-10 items-center rounded-lg bg-destructive px-5 text-[13px] font-bold text-white transition-colors hover:opacity-90 disabled:opacity-60"
              >
                Leave
              </button>
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                disabled={saving}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                Keep editing
              </button>
            </div>
          )
          )}
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="sticky top-24">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Live preview
          </p>
          <div className="max-h-[min(880px,calc(100vh-9rem))] overflow-y-auto rounded-xl">
            <EventPreview data={previewData} trackNames={trackNames} dateRange={dateRange} />
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}
