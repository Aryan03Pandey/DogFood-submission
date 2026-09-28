'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, EyeOff, RefreshCw, Trophy } from 'lucide-react'

const PAGE_SIZE = 10
const REFRESH_COOLDOWN_MS = 15_000

interface LeaderboardRow {
  submissionId: string
  title: string
  teamName: string
  trackName: string
  totalVotes: number
  voterCount: number
}

// Public leaderboard screen. No background refetching: the table loads once
// per page load and only refetches when the visitor hits Refresh, which is
// throttled to one fetch per cooldown window. The cooldown deadline persists
// in localStorage (per event), so leaving the page or reloading it cannot
// reset the wait.
export function VotingLeaderboard({
  eventId,
  eventTitle,
  backHref,
  backLabel,
}: {
  eventId: string
  eventTitle: string
  backHref: string
  backLabel: string
}) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)
  const [hidden, setHidden] = useState(false)
  const [page, setPage] = useState(0)
  const storageKey = `leaderboard-refresh-cooldown:${eventId}`
  // Server-safe defaults: reading localStorage or Date.now() during render
  // would differ from the server snapshot and break hydration. The persisted
  // cooldown is rehydrated in the mount effect below instead.
  const [coolingUntil, setCoolingUntil] = useState(0)
  const [now, setNow] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/events/${eventId}/votes`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Failed to load leaderboard')
      setHidden(data.results === null)
      setRows(data.results ?? [])
      setPage(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    void load()
  }, [load])

  // Client-only rehydration: runs after hydration, so the persisted cooldown
  // never leaks into the server-rendered HTML.
  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(storageKey))
      if (Number.isFinite(stored) && stored > Date.now()) setCoolingUntil(stored)
    } catch {
      // Private-mode storage failure: the refresh simply starts unthrottled.
    }
    setNow(Date.now())
  }, [storageKey])

  useEffect(() => {
    if (coolingUntil <= Date.now()) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [coolingUntil])

  const coolingLeft = Math.max(0, Math.ceil((coolingUntil - now) / 1000))

  function refresh() {
    if (coolingLeft > 0 || loading) return
    const until = Date.now() + REFRESH_COOLDOWN_MS
    try {
      window.localStorage.setItem(storageKey, String(until))
    } catch {
      // Private-mode storage failure: the in-memory cooldown still applies.
    }
    setCoolingUntil(until)
    setNow(Date.now())
    void load()
  }

  const pageCount = Math.max(1, Math.ceil((rows ?? []).length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = (rows ?? []).slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <a
            href={backHref}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" /> {backLabel}
          </a>
          <div>
            <h2 className="flex items-center gap-1.5 text-[15px] font-bold text-foreground">
              <Trophy size={15} strokeWidth={1.8} aria-hidden="true" /> Community Voting Leaderboard
            </h2>
            <p className="text-[12px] text-muted-foreground">{eventTitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading || coolingLeft > 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw size={13} strokeWidth={1.8} aria-hidden="true" />
          {coolingLeft > 0 ? `Refresh (${coolingLeft}s)` : 'Refresh'}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-border px-4 py-2.5 text-[13px] font-semibold text-destructive">
          {error}
        </p>
      )}

      {hidden && !loading && (
        <p className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-4 py-3 text-[13px] text-muted-foreground">
          <EyeOff size={14} strokeWidth={1.8} aria-hidden="true" />
          Live results are hidden while blind voting is active.
        </p>
      )}

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold text-foreground">Rankings</h3>
          {pageCount > 1 && (
            <span className="ml-auto flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                disabled={safePage === 0}
                className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
              >
                Prev
              </button>
              <span className="font-semibold">
                Page {safePage + 1} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
                disabled={safePage >= pageCount - 1}
                className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
              >
                Next
              </button>
            </span>
          )}
        </div>
        {loading ? (
          <p className="mt-2 animate-pulse text-[13px] text-muted-foreground">Loading leaderboard…</p>
        ) : pageRows.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">No votes yet.</p>
        ) : (
          <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-[12px] text-muted-foreground">
                  <th scope="col" className="bg-card px-4 py-2 font-bold">Rank</th>
                  <th scope="col" className="bg-card px-4 py-2 font-bold">Project</th>
                  <th scope="col" className="bg-card px-4 py-2 font-bold">Team</th>
                  <th scope="col" className="bg-card px-4 py-2 font-bold">Voters</th>
                  <th scope="col" className="bg-card px-4 py-2 font-bold">Votes</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, index) => (
                  <tr key={row.submissionId} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-mono font-bold text-foreground">#{safePage * PAGE_SIZE + index + 1}</td>
                    <td className="px-4 py-2 font-semibold text-foreground">{row.title}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.teamName}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.voterCount}</td>
                    <td className="px-4 py-2 font-mono font-bold text-foreground">{row.totalVotes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
