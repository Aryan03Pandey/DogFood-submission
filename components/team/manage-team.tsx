'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Crown, Lock, Pencil, RefreshCw, Trash2 } from 'lucide-react'

import {
  ApiError,
  apiDeleteTeam,
  apiGetMyTeam,
  apiKickMember,
  apiLeaveTeam,
  apiRenameTeam,
  apiRotateInviteToken,
  apiSubmitTeam,
  apiTransferLeadership,
  type TeamSummaryPayload,
} from '@/lib/api-client'

function actionError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.code === 'TEAM_LOCKED') return 'This roster is locked — submissions are in.'
  if (err instanceof ApiError && err.code === 'TEAM_INCOMPLETE') return 'Complete the roster (min–max members) before submitting.'
  if (err instanceof ApiError && err.code === 'ALREADY_SUBMITTED') return 'This team is already submitted.'
  if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') return 'Wrong password. Try again.'
  if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') return 'Check the highlighted fields and try again.'
  if (err instanceof ApiError && err.code === 'FORBIDDEN') return 'Only the leader can do that.'
  if (err instanceof ApiError && err.code === 'NOT_IN_TEAM') return 'That member is no longer on the team.'
  return fallback
}

// Roster home for members: rename (leader), invite code (leader only, with
// an expiry notice and rotation), teammates with captain on top,
// Leave / Make captain / Remove, completeness message, password-confirmed
// Submit Team, and password-confirmed Cancel Team. Submitted teams render
// read-only with a locked banner; only Cancel Team stays available.
export function ManageTeam({
  eventId,
  slug,
  initial,
}: {
  eventId: string
  slug: string
  initial: TeamSummaryPayload
}) {
  const router = useRouter()
  const [summary, setSummary] = useState(initial)
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(initial.team.name)
  // One pending destructive/intent action at a time: opening one confirm
  // closes any other, so cancel and submit can never overlap on screen.
  const [confirming, setConfirming] = useState<'submit' | 'cancel' | 'leave' | null>(null)
  const [password, setPassword] = useState('')
  const [submitPassword, setSubmitPassword] = useState('')
  const [working, setWorking] = useState(false)
  // Which action is in flight: pending labels stay on their own button, so
  // renaming no longer flashes the invite-code generator.
  const [workingLabel, setWorkingLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const { team, members, minTeamSize, maxTeamSize, frozen, inviteExpired, isLeader } = summary
  const submitted = team.isLocked
  const size = members.length
  const complete = size >= minTeamSize && size <= maxTeamSize
  const needMore = Math.max(0, minTeamSize - size)

  async function refresh() {
    const { team: next } = await apiGetMyTeam(eventId)
    if (next) setSummary(next)
    else router.refresh()
  }

  async function run(label: string, fn: () => Promise<TeamSummaryPayload | void>) {
    if (working) return
    setWorking(true)
    setWorkingLabel(label)
    setError(null)
    setNotice(null)
    try {
      const next = await fn()
      if (next) setSummary(next)
      else await refresh()
    } catch (err) {
      setError(actionError(err, `${label} failed. Try again.`))
    } finally {
      setWorking(false)
      setWorkingLabel(null)
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {submitted ? (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-[#16a34a]/30 bg-[#16a34a]/10 p-4 text-[12px] font-semibold text-[#16a34a] dark:text-[#22c55e]">
          <Lock size={14} strokeWidth={1.8} aria-hidden="true" />
          Team locked and submitted — the roster is final and read-only.
        </p>
      ) : (
        frozen && (
          <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-muted p-4 text-[12px] font-semibold text-muted-foreground">
            <Lock size={14} strokeWidth={1.8} aria-hidden="true" />
            Roster locked — joins, leaves, kicks, and transfers are closed.
          </p>
        )
      )}
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

      <section aria-label="Team name" className="rounded-xl border border-border bg-card p-6">
        {editingName && isLeader ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              run('Rename', async () => {
                const { team: next } = await apiRenameTeam(eventId, team.id, name.trim())
                setEditingName(false)
                return next
              })
            }}
            className="flex gap-2"
          >
            <label htmlFor="team-rename" className="sr-only">
              Team name
            </label>
            <input
              id="team-rename"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
            />
            <button
              type="submit"
              disabled={working || name.trim() === ''}
              className="inline-flex h-10 shrink-0 items-center rounded-lg bg-[#16a34a] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
            >
              {workingLabel === 'Rename' ? 'Saving…' : 'Save'}
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] font-bold text-foreground">{team.name}</h2>
            {isLeader && !frozen && (
              <button
                type="button"
                onClick={() => {
                  setName(team.name)
                  setEditingName(true)
                }}
                aria-label="Edit team name"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil size={14} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        <p className="mt-1 text-[12px] text-muted-foreground">
          Teammates ({size}/{maxTeamSize})
          {' · '}
          {complete ? (
            <span className="font-bold text-[#16a34a] dark:text-[#22c55e]">Team complete</span>
          ) : (
            <span className="font-bold text-destructive">
              Team incomplete — add {needMore} more member{needMore === 1 ? '' : 's'} to complete
            </span>
          )}
        </p>
      </section>

      {isLeader && !submitted && (
        <section aria-label="Invite code" className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-[15px] font-bold text-foreground">Invite code</h3>
          {inviteExpired ? (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
              <p className="text-[13px] font-bold text-destructive">Your invite code has expired.</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Nobody can join with it anymore. Generate a new invite code to keep inviting.
              </p>
              <button
                type="button"
                disabled={working}
                onClick={() =>
                  run('Rotation', async () => {
                    const { token } = await apiRotateInviteToken(eventId, team.id)
                    setFreshToken(token)
                    setNotice('New invite code generated. Copy it now — it shows only once.')
                    await refresh()
                    return undefined
                  })
                }
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
              >
                <RefreshCw size={15} strokeWidth={1.8} aria-hidden="true" />
                {workingLabel === 'Rotation' ? 'Generating…' : 'Generate new invite code'}
              </button>
            </div>
          ) : freshToken ? (
            <div className="mt-3">
              <p className="inline-block rounded-lg bg-muted px-4 py-2 font-mono text-[15px] font-bold tracking-widest text-foreground">
                {freshToken}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => copy(freshToken)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-4 text-[12px] font-bold text-foreground transition-colors hover:bg-muted"
                >
                  {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy code'}
                </button>
                <button
                  type="button"
                  onClick={() => copy(`${window.location.origin}/invite?token=${freshToken}`)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-4 text-[12px] font-bold text-foreground transition-colors hover:bg-muted"
                >
                  <Copy size={14} aria-hidden="true" /> Copy invite link
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-[13px] text-muted-foreground">
                The code only shows right after creation or rotation — codes are stored hashed
                and cannot be read back. Generate a new one to invite more hackers.
              </p>
              <button
                type="button"
                disabled={working}
                onClick={() =>
                  run('Rotation', async () => {
                    const { token } = await apiRotateInviteToken(eventId, team.id)
                    setFreshToken(token)
                    setNotice('New invite code generated. Copy it now — it shows only once.')
                    await refresh()
                    return undefined
                  })
                }
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-border px-5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                <RefreshCw size={15} strokeWidth={1.8} aria-hidden="true" />
                {workingLabel === 'Rotation' ? 'Generating…' : 'Generate new invite code'}
              </button>
            </div>
          )}
        </section>
      )}

      <section aria-label="Teammates" className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-[15px] font-bold text-foreground">Teammates</h3>
        <ul className="mt-3 flex flex-col gap-2">
          {members.map((member, index) => (
            <li
              key={member.userId}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
            >
              <span className="w-5 shrink-0 text-[12px] font-bold text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
                  <span className="truncate">{member.name ?? member.email}</span>
                  {member.role === 'LEADER' && (
                    <Crown size={13} strokeWidth={2} aria-label="Captain" className="shrink-0 text-[#16a34a] dark:text-[#22c55e]" />
                  )}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {member.email}
                  {member.role === 'LEADER' ? ' · captain' : ''}
                  {member.isSelf ? ' · Me' : ''}
                </span>
              </span>
              {member.isSelf ? (
                confirming !== 'leave' ? (
                  <button
                    type="button"
                    disabled={working || frozen}
                    title={frozen ? 'Roster locked' : isLeader ? 'Leaving transfers ownership' : 'Leave team'}
                    onClick={() => setConfirming('leave')}
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[12px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                  >
                    Leave
                  </button>
                ) : (
                  <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <span className="basis-full text-[11px] font-semibold text-destructive">
                      {size === 1
                        ? 'You are the last member — leaving deletes the team and unregisters you.'
                        : isLeader
                          ? 'Leaving transfers captaincy to the longest-tenured teammate.'
                          : 'You will leave the team but stay registered.'}
                    </span>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() =>
                        run('Leave', async () => {
                          const result = await apiLeaveTeam(eventId, team.id)
                          setConfirming(null)
                          if (result.deleted) {
                            router.push(`/hackathons/${slug}`)
                            router.refresh()
                            return undefined
                          }
                          setNotice(
                            result.transferredTo
                              ? 'Ownership transferred to the longest-tenured teammate.'
                              : 'You left the team.',
                          )
                          await refresh()
                          return undefined
                        })
                      }
                      className="rounded-lg bg-destructive px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:opacity-90 disabled:opacity-60"
                    >
                      {workingLabel === 'Leave' ? 'Leaving…' : 'Confirm leave'}
                    </button>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => setConfirming(null)}
                      className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                    >
                      Stay
                    </button>
                  </span>
                )
              ) : (
                isLeader &&
                !frozen && (
                  <span className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      disabled={working}
                      onClick={() =>
                        run('Transfer', async () => {
                          const { team: next } = await apiTransferLeadership(eventId, team.id, member.userId)
                          setNotice('Ownership transferred.')
                          return next
                        })
                      }
                      className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      Make captain
                    </button>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() =>
                        run('Remove', async () => {
                          const { team: next } = await apiKickMember(eventId, team.id, member.userId)
                          return next
                        })
                      }
                      aria-label={`Remove ${member.email}`}
                      className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </span>
                )
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {!submitted &&
          isLeader &&
          (confirming !== 'submit' ? (
            <button
              type="button"
              onClick={() => setConfirming('submit')}
              className="inline-flex h-10 items-center rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d]"
            >
              Submit Team
            </button>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (submitPassword === '' || working) return
                run('Submit', async () => {
                  const { team: next } = await apiSubmitTeam(eventId, team.id, submitPassword)
                  setConfirming(null)
                  setSubmitPassword('')
                  setNotice('Team submitted. The roster is now locked and read-only.')
                  return next
                })
              }}
              className="flex basis-full flex-wrap items-center gap-2 rounded-xl border border-[#16a34a]/30 bg-[#16a34a]/5 p-4"
            >
              <p className="basis-full text-[12px] font-semibold text-foreground">
                Finalize team and submit — this action is not reversible. The roster locks
                and no further changes are possible.
              </p>
              <label htmlFor={`submit-team-${team.id}`} className="sr-only">
                Confirm with your password
              </label>
              <input
                id={`submit-team-${team.id}`}
                type="password"
                value={submitPassword}
                onChange={(event) => setSubmitPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Your password"
                className="h-10 w-52 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
              />
              <button
                type="submit"
                disabled={working || submitPassword === ''}
                className="inline-flex h-10 items-center rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
              >
                {workingLabel === 'Submit' ? 'Submitting…' : 'Confirm submit'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(null)
                  setSubmitPassword('')
                }}
                disabled={working}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                Back
              </button>
            </form>
          ))}
        {isLeader && (!frozen || submitted) &&
          (confirming !== 'cancel' ? (
            <button
              type="button"
              onClick={() => setConfirming('cancel')}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-destructive/40 px-5 text-[13px] font-bold text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" /> Cancel Team
            </button>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (password === '' || working) return
                run('Delete', async () => {
                  await apiDeleteTeam(eventId, team.id, password)
                  router.push(`/hackathons/${slug}`)
                  router.refresh()
                  return undefined
                })
              }}
              className="flex basis-full flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
            >
              <p className="basis-full text-[12px] font-semibold text-foreground">
                Warning: cancelling removes the entire team and unregisters every member
                from the event. This cannot be undone.
              </p>
              <label htmlFor={`cancel-team-${team.id}`} className="sr-only">
                Confirm with your password
              </label>
              <input
                id={`cancel-team-${team.id}`}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Your password"
                className="h-10 w-52 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-destructive"
              />
              <button
                type="submit"
                disabled={working || password === ''}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-destructive px-5 text-[13px] font-bold text-white transition-colors hover:opacity-90 disabled:opacity-60"
              >
                {workingLabel === 'Delete' ? 'Deleting…' : 'Confirm cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(null)
                  setPassword('')
                }}
                disabled={working}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                Keep team
              </button>
            </form>
          ))}
      </div>
    </div>
  )
}
