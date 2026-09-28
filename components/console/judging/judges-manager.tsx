'use client'

import { useEffect, useState } from 'react'
import { Search, Trash2, UserPlus } from 'lucide-react'

import {
  ApiError,
  apiInviteJudge,
  apiListJudgeCandidates,
  apiListTracks,
  apiRemoveJudge,
  apiSetJudgeTracks,
  type JudgeCandidatePayload,
  type TrackPayload,
} from '@/lib/api-client'
import { validationDetailsMessage } from '@/lib/api-client'

export interface JudgeRow {
  id: string
  name: string | null
  email: string
  organization: string | null
  tracks: Array<{ judgeId: string; trackId: string; trackName: string }>
}

function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'PARTICIPANT_IS_JUDGE') return 'That user participates in this event and cannot judge it.'
    if (error.code === 'INVALID_CREDENTIALS') return 'Wrong password. Try again.'
    if (error.code === 'JUDGE_NOT_FOUND') return 'That judge is already gone.'
    if (error.code === 'FORBIDDEN') return 'Only organizers can manage judges.'
    if (error.code === 'NETWORK_ERROR') return 'Request failed. Is the server running?'
    if (error.code === 'VALIDATION_ERROR') return validationDetailsMessage(error) ?? 'Check the input and try again.'
  }
  return 'Request failed. Try again.'
}

// Judge roster: search-all-users invite (same-event participants are shown
// but not invitable), per-row track qualification, per-row remove with
// password confirmation. Removing a judge reassigns their queue with the
// event's algorithm; the response counts are reported back.
export function JudgesManager({
  eventId,
  initial,
  onChanged,
}: {
  eventId: string
  initial: JudgeRow[]
  onChanged: () => void
}) {
  const [judges, setJudges] = useState(initial)
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<JudgeCandidatePayload[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)
  const [eventTracks, setEventTracks] = useState<TrackPayload[] | null>(null)
  const [editingTracksId, setEditingTracksId] = useState<string | null>(null)
  const [draftTrackIds, setDraftTrackIds] = useState<string[]>([])
  const [savingTracks, setSavingTracks] = useState(false)

  // Track catalogue for the per-judge qualification picker. Judges without
  // any track link are ineligible for every submission, so the picker is
  // the only path from "judge added" to "judge receives assignments".
  useEffect(() => {
    let cancelled = false
    apiListTracks(eventId)
      .then(({ tracks }) => {
        if (!cancelled) setEventTracks(tracks)
      })
      .catch(() => {
        if (!cancelled) setEventTracks([])
      })
    return () => {
      cancelled = true
    }
  }, [eventId])

  // Roster always resyncs from the server after a mutation: optimistic
  // local edits plus a parent remount used to resurrect removed rows.
  async function refreshRoster() {
    const { judges } = await apiListJudgeCandidates(eventId)
    setJudges(judges)
  }

  async function search() {
    setSearching(true)
    setError(null)
    try {
      const { candidates } = await apiListJudgeCandidates(eventId, query)
      setCandidates(candidates)
    } catch (err) {
      setError(message(err))
    } finally {
      setSearching(false)
    }
  }

  async function invite(userId: string) {
    setWorking(true)
    setError(null)
    try {
      await apiInviteJudge(eventId, userId)
      setCandidates(null)
      setQuery('')
      setNotice('Judge added.')
      await refreshRoster()
      onChanged()
    } catch (err) {
      setError(message(err))
    } finally {
      setWorking(false)
    }
  }

  async function saveTracks(userId: string) {
    setSavingTracks(true)
    setError(null)
    try {
      await apiSetJudgeTracks(eventId, userId, draftTrackIds)
      setEditingTracksId(null)
      setNotice('Judge tracks updated. Re-run Generate assignments to apply them.')
      await refreshRoster()
      onChanged()
    } catch (err) {
      setError(message(err))
    } finally {
      setSavingTracks(false)
    }
  }

  async function remove(userId: string) {
    if (password === '' || working) return
    setWorking(true)
    setError(null)
    try {
      const result = await apiRemoveJudge(eventId, userId, password)
      setRemovingId(null)
      setPassword('')
      setNotice(
        `Judge removed. ${result.orphaned} assigned submission(s), ${result.reassigned} reassigned.` +
          (result.unresolved.length > 0 ? ` ${result.unresolved.length} still need reviewers.` : ''),
      )
      await refreshRoster()
      onChanged()
    } catch (err) {
      setError(message(err))
    } finally {
      setWorking(false)
    }
  }

  return (
    <section aria-label="Judges" className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-[15px] font-bold text-foreground">Judges</h3>
      {notice && (
        <p role="status" className="mt-3 rounded-xl border border-[#16a34a]/30 bg-[#16a34a]/10 p-3 text-[12px] font-semibold text-[#16a34a] dark:text-[#22c55e]">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
      >
        <label htmlFor="judge-search" className="sr-only">
          Search users
        </label>
        <div className="relative flex-1">
          <Search size={15} strokeWidth={1.8} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            id="judge-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search users by name, email, or organization"
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>
      {candidates !== null && (
        <ul className="mt-3 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {candidates.length === 0 && (
            <li className="text-[13px] text-muted-foreground">No users match that search.</li>
          )}
          {candidates.map((candidate) => {
            const isParticipant = candidate.eventRole === 'PARTICIPANT'
            const isJudge = candidate.eventRole === 'JUDGE'
            return (
              <li key={candidate.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-foreground">
                    {candidate.name ?? candidate.email}
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {candidate.email}
                    {isParticipant && ' · participates in this event'}
                    {isJudge && ' · already judging'}
                    {candidate.eventRole === 'ORGANIZER' && ' · organizer'}
                  </span>
                </span>
                {!isParticipant && !isJudge && (
                  <button
                    type="button"
                    onClick={() => void invite(candidate.id)}
                    disabled={working}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[#16a34a] px-3 text-[12px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
                  >
                    <UserPlus size={14} strokeWidth={1.8} aria-hidden="true" /> Add
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <h4 className="mt-5 text-[13px] font-bold text-foreground">Current judges ({judges.length})</h4>
      {judges.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">No judges yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {judges.map((judge) => (
            <li key={judge.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-foreground">
                  {judge.name ?? judge.email}
                </span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {judge.email}
                  {judge.tracks.length > 0
                    ? ` · ${judge.tracks.map((track) => track.trackName).join(', ')}`
                    : ' · no tracks — will not receive assignments'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  if (editingTracksId === judge.id) {
                    setEditingTracksId(null)
                  } else {
                    setEditingTracksId(judge.id)
                    setDraftTrackIds(judge.tracks.map((track) => track.trackId))
                  }
                }}
                className="inline-flex h-8 shrink-0 items-center rounded-lg border border-border px-3 text-[12px] font-bold text-foreground transition-colors hover:bg-muted"
              >
                Tracks
              </button>
              {editingTracksId === judge.id && (
                <div className="flex basis-full flex-col gap-2 rounded-lg bg-muted/50 p-3">
                  {eventTracks === null ? (
                    <p className="text-[12px] text-muted-foreground">Loading tracks…</p>
                  ) : eventTracks.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">
                      This event has no tracks yet. Add tracks before qualifying judges.
                    </p>
                  ) : (
                    eventTracks.map((track) => (
                      <label key={track.id} className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground">
                        <input
                          type="checkbox"
                          checked={draftTrackIds.includes(track.id)}
                          onChange={(event) =>
                            setDraftTrackIds((ids) =>
                              event.target.checked ? [...ids, track.id] : ids.filter((id) => id !== track.id),
                            )
                          }
                          className="h-4 w-4 accent-[#16a34a]"
                        />
                        {track.name}
                      </label>
                    ))
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void saveTracks(judge.id)}
                      disabled={savingTracks || eventTracks === null}
                      className="inline-flex h-8 items-center rounded-lg bg-[#16a34a] px-3 text-[12px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
                    >
                      {savingTracks ? 'Saving…' : 'Save tracks'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTracksId(null)}
                      disabled={savingTracks}
                      className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-[12px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {removingId === judge.id ? (
                <form
                  className="flex basis-full items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void remove(judge.id)
                  }}
                >
                  <label htmlFor={`remove-judge-${judge.id}`} className="sr-only">
                    Confirm with your password
                  </label>
                  <input
                    id={`remove-judge-${judge.id}`}
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Your password"
                    className="h-9 w-44 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-destructive"
                  />
                  <button
                    type="submit"
                    disabled={working || password === ''}
                    className="inline-flex h-9 items-center rounded-lg bg-destructive px-4 text-[12px] font-bold text-white transition-colors hover:opacity-90 disabled:opacity-60"
                  >
                    {working ? 'Removing…' : 'Confirm remove'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRemovingId(null)
                      setPassword('')
                    }}
                    disabled={working}
                    className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-[12px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                  >
                    Keep
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setRemovingId(judge.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-[12px] font-bold text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" /> Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
