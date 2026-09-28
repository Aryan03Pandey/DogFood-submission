'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, Pencil, Trash2, Upload, UserMinus, UserPlus } from 'lucide-react'

import {
  ApiError,
  apiAssignEventRole,
  apiDeleteEvent,
  apiImportData,
  apiLookupUser,
  apiRemoveEventRole,
  apiSetGlobalRole,
  type EventPayload,
  type ImportSummaryPayload,
} from '@/lib/api-client'
import { GoLiveControl } from '@/components/console/dashboard/go-live-control'
import { WebhooksPanel } from '@/components/console/dashboard/webhooks-panel'
import type { DashboardMember } from '@/src/server/dashboard-service'
import type { WebhookEndpointPayload } from '@/lib/api-client'
import { cn } from '@/lib/utils'

type GrantableRole = 'ORGANIZER' | 'JUDGE' | 'ADMIN'

// Event Settings tab: go-live, member management (organizers, judges, and —
// for superadmins — global admins), webhooks, danger zone, and a disabled
// Export-everything placeholder. Event editing lives in a separate window.
export function SettingsPanel({
  event,
  members,
  selfId,
  isSuperadmin,
  webhooks,
}: {
  event: EventPayload
  members: DashboardMember[]
  selfId: string
  isSuperadmin: boolean
  webhooks: WebhookEndpointPayload[]
}) {
  const router = useRouter()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<GrantableRole>('ORGANIZER')
  const isDraft = event.status === 'DRAFT'

  // Import data (instance-wide — see the section below; this is NOT scoped
  // to `event`, it's a superadmin-only restore of the whole instance or
  // whatever an uploaded export file itself scopes to).
  const [importFileName, setImportFileName] = useState<string | null>(null)
  const [importPayload, setImportPayload] = useState<unknown>(null)
  const [importForce, setImportForce] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importStage, setImportStage] = useState<'idle' | 'dryRunning' | 'dryRunDone' | 'applying' | 'applied'>('idle')
  const [importSummary, setImportSummary] = useState<ImportSummaryPayload | null>(null)
  const [needsForceHint, setNeedsForceHint] = useState(false)
  const [confirmingApply, setConfirmingApply] = useState(false)

  // The file input AND the force checkbox both reset the dry-run gate: a
  // dry run only proves what applying THIS file with THIS force value would
  // do, so changing either one invalidates it (a user must not be able to
  // dry-run without force, flip the checkbox, then Apply with untested
  // settings).
  function resetImportProgress() {
    setImportStage('idle')
    setImportSummary(null)
    setImportError(null)
    setNeedsForceHint(false)
    setConfirmingApply(false)
  }

  async function onImportFileChange(fileList: FileList | null) {
    const file = fileList?.[0]
    resetImportProgress()
    if (!file) {
      setImportFileName(null)
      setImportPayload(null)
      return
    }
    setImportFileName(file.name)
    try {
      setImportPayload(JSON.parse(await file.text()))
    } catch {
      setImportPayload(null)
      setImportError("That file isn't valid JSON.")
    }
  }

  function onImportForceChange(checked: boolean) {
    setImportForce(checked)
    resetImportProgress()
  }

  function importErrorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.code === 'INSTANCE_NOT_EMPTY') return 'instance-not-empty' // handled separately below
      if (err.status === 413) return 'File too large — 25MB max.'
      if (err.status === 411) return 'The upload was missing its length — try a smaller file or a different browser.'
      if (err.code === 'INVALID_SIGNATURE') return 'This file is signed, but the signature does not match its contents — it may have been altered.'
      if (err.code === 'FORBIDDEN') return 'You cannot import data.'
    }
    return 'Import failed. Try again.'
  }

  async function runDryRun() {
    if (importPayload === null || importStage === 'dryRunning') return
    setImportStage('dryRunning')
    setImportError(null)
    setNeedsForceHint(false)
    try {
      const summary = await apiImportData(importPayload, { dryRun: true, force: importForce })
      setImportSummary(summary)
      setImportStage('dryRunDone')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INSTANCE_NOT_EMPTY') {
        setNeedsForceHint(true)
        setImportError(
          'This instance already has data beyond the seed/fixtures — check "Force overwrite" below to proceed anyway.',
        )
      } else {
        setImportError(importErrorMessage(err))
      }
      setImportStage('idle')
    }
  }

  async function applyImport() {
    if (importStage !== 'dryRunDone' && !confirmingApply) return
    if (!confirmingApply) {
      setConfirmingApply(true)
      return
    }
    setImportStage('applying')
    setImportError(null)
    try {
      const summary = await apiImportData(importPayload, { dryRun: false, force: importForce })
      setImportSummary(summary)
      setImportStage('applied')
      router.refresh()
    } catch (err) {
      setImportError(importErrorMessage(err))
      setImportStage('dryRunDone')
    } finally {
      setConfirmingApply(false)
    }
  }

  async function removeEvent() {
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    if (deletePassword === '' || working) return
    setWorking(true)
    setError(null)
    try {
      await apiDeleteEvent(event.id, deletePassword)
      router.push('/console')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        setError('Wrong password. Try again.')
      } else if (err instanceof ApiError && err.code === 'FORBIDDEN') {
        setError('You cannot delete this event.')
        setConfirmingDelete(false)
        setDeletePassword('')
      } else {
        setError('Delete failed. Try again.')
      }
      setWorking(false)
    }
  }

  async function addMember() {
    const needle = email.trim()
    if (needle === '' || working) return
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const found = await apiLookupUser(needle)
      const target = found.users[0]
      if (!target) {
        setError(`No account found for ${needle}.`)
        return
      }
      if (role === 'ADMIN') {
        await apiSetGlobalRole(target.id, 'SUPERADMIN')
        setNotice(`${target.email} is now an admin.`)
      } else {
        await apiAssignEventRole(event.id, { userId: target.id, role })
        setNotice(
          role === 'ORGANIZER'
            ? `${target.email} was added as an organizer.`
            : `${target.email} was added as a judge.`,
        )
      }
      setEmail('')
      router.refresh()
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'FORBIDDEN'
          ? 'You cannot grant that role.'
          : 'Could not add that member. Try again.',
      )
    } finally {
      setWorking(false)
    }
  }

  async function removeMember(userId: string) {
    if (working) return
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      await apiRemoveEventRole(event.id, userId)
      router.refresh()
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'CANNOT_REMOVE_SELF'
          ? 'You cannot remove yourself.'
          : 'Could not remove that member. Try again.',
      )
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-[#16a34a]/30 bg-[#16a34a]/10 p-4 text-[12px] font-semibold text-[#16a34a] dark:text-[#22c55e]">
          {notice}
        </p>
      )}

      <section aria-label="Edit event" className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-[15px] font-bold text-foreground">Edit event</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Change title, timeline, tracks, prizes, and other event details.
        </p>
        <Link
          href={`/console/events/${event.id}/edit`}
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d]"
        >
          <Pencil size={15} strokeWidth={1.8} aria-hidden="true" /> Edit event
        </Link>
      </section>

      <section aria-label="Visibility" className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-[15px] font-bold text-foreground">Visibility</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Status: <span className="font-bold capitalize text-foreground">{event.status.toLowerCase().replace('_', ' ')}</span>
          {isDraft && ' — invisible until go-live.'}
        </p>
        {isDraft && (
          <div className="mt-3">
            <GoLiveControl eventId={event.id} isDraft={isDraft} />
          </div>
        )}
      </section>

      <section aria-label="Members" className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-[15px] font-bold text-foreground">Members</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Organizers and judges are scoped to this event.
          {isSuperadmin && ' Admins get instance-wide access.'}
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {members.length === 0 && (
            <li className="text-[13px] text-muted-foreground">No event members yet.</li>
          )}
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-foreground">
                  {member.name ?? member.email}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {member.email} · <span className="capitalize">{member.role.toLowerCase()}</span>
                </span>
              </span>
              {member.userId !== selfId && (
                <button
                  type="button"
                  onClick={() => removeMember(member.userId)}
                  disabled={working}
                  aria-label={`Remove ${member.email}`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-60"
                >
                  <UserMinus size={15} strokeWidth={1.8} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@example.org"
            aria-label="Member email"
            inputMode="email"
            className="h-10 min-w-52 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as GrantableRole)}
            aria-label="Role to grant"
            className="h-10 rounded-lg border border-border bg-background px-3 text-[13px] font-semibold text-foreground outline-none focus:border-[#16a34a]"
          >
            <option value="ORGANIZER">Organizer</option>
            <option value="JUDGE">Judge</option>
            {isSuperadmin && <option value="ADMIN">Admin</option>}
          </select>
          <button
            type="button"
            onClick={addMember}
            disabled={working || email.trim() === ''}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            <UserPlus size={15} strokeWidth={1.8} aria-hidden="true" /> Add
          </button>
        </div>
      </section>

      <section aria-label="Export" className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-[15px] font-bold text-foreground">Export</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Downloads everything for this event — tracks, prizes, teams, submissions, judging, and
          votes — as one cryptographically signed JSON file. Verify it anytime at{' '}
          <a href="/verify" className="font-semibold text-foreground underline">
            /verify
          </a>
          . Full-event CSV export (participants, teams, submissions, judging, and voting) is
          available too.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`/api/events/${event.id}/export.json`}
            download
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            <Download size={15} strokeWidth={1.8} aria-hidden="true" /> Export event (JSON)
          </a>
          <a
            href={`/api/events/${event.id}/export`}
            download
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            <Download size={15} strokeWidth={1.8} aria-hidden="true" /> Export everything as CSV
          </a>
        </div>
      </section>

      {isSuperadmin && (
        <section aria-label="Import" className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-[15px] font-bold text-foreground">Import data (instance-wide)</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Restores a previously exported file. This is <span className="font-semibold text-foreground">not</span>{' '}
            limited to the event selected above — an instance-scope backup rewrites data across the
            whole install. Always run a dry run first.
          </p>

          {importError && (
            <p role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-[12px] font-semibold text-destructive">
              {importError}
            </p>
          )}
          {importStage === 'applied' && importSummary && (
            <div role="status" className="mt-3 rounded-xl border border-[#16a34a]/30 bg-[#16a34a]/10 p-4 text-[12px] font-semibold text-[#16a34a] dark:text-[#22c55e]">
              <p>Import applied.</p>
              {importSummary.placeholderPasswordUserIds.length > 0 && (
                <p className="mt-1 font-normal">
                  {importSummary.placeholderPasswordUserIds.length} user(s) had no password in the file and got a
                  placeholder — they need a real password set before they can log in.
                </p>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted">
              <Upload size={15} strokeWidth={1.8} aria-hidden="true" />
              {importFileName ?? 'Choose file'}
              <input
                type="file"
                accept="application/json"
                onChange={(event) => onImportFileChange(event.target.files)}
                className="hidden"
              />
            </label>
            {needsForceHint && (
              <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-foreground">
                <input
                  type="checkbox"
                  checked={importForce}
                  onChange={(event) => onImportForceChange(event.target.checked)}
                />
                Force overwrite
              </label>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runDryRun}
              disabled={importPayload === null || importStage === 'dryRunning'}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              {importStage === 'dryRunning' ? 'Running dry run…' : 'Run dry run'}
            </button>
            {(importStage === 'dryRunDone' || importStage === 'applying') && (
              <button
                type="button"
                onClick={applyImport}
                disabled={importStage === 'applying'}
                className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[13px] font-bold text-white transition-colors disabled:opacity-60',
                  confirmingApply ? 'bg-destructive hover:opacity-90' : 'bg-[#16a34a] hover:bg-[#15803d]',
                )}
              >
                {importStage === 'applying' ? 'Applying…' : confirmingApply ? 'Confirm apply' : 'Apply'}
              </button>
            )}
            {confirmingApply && (
              <button
                type="button"
                onClick={() => setConfirmingApply(false)}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
            )}
          </div>

          {importSummary && importStage !== 'applied' && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-border bg-background p-3 text-[12px] sm:grid-cols-3">
              {Object.entries(importSummary.counts).map(([table, count]) => (
                <div key={table} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{table}</dt>
                  <dd className="font-bold text-foreground">{count}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}

      <WebhooksPanel eventId={event.id} initialWebhooks={webhooks} />

      {isSuperadmin && (
      <section aria-label="Danger zone" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h3 className="text-[15px] font-bold text-destructive">Danger zone</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Deleting removes the event, its tracks, prizes, teams, submissions, and votes. This cannot be undone.
          Deleting needs your password.
        </p>
        {!confirmingDelete ? (
          <button
            type="button"
            onClick={removeEvent}
            className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-destructive px-5 text-[13px] font-bold text-white transition-colors hover:opacity-90"
          >
            <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
            Delete the event
          </button>
        ) : (
          <form
            onSubmit={(formEvent) => {
              formEvent.preventDefault()
              removeEvent()
            }}
            className="mt-3 flex max-w-sm flex-col gap-2"
          >
            <label htmlFor={`delete-password-${event.id}`} className="text-[12px] font-bold text-foreground">
              Confirm with your password
            </label>
            <div className="flex gap-2">
              <input
                id={`delete-password-${event.id}`}
                type="password"
                value={deletePassword}
                onChange={(formEvent) => setDeletePassword(formEvent.target.value)}
                autoComplete="current-password"
                placeholder="Your password"
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-destructive"
              />
              <button
                type="submit"
                disabled={working || deletePassword === ''}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-destructive px-5 text-[13px] font-bold text-white transition-colors hover:opacity-90 disabled:opacity-60"
              >
                <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
                {working ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false)
                  setDeletePassword('')
                }}
                disabled={working}
                className="inline-flex h-10 shrink-0 items-center rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
      )}
    </div>
  )
}
