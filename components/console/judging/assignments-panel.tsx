'use client'

import { useState } from 'react'
import { Download, Play } from 'lucide-react'

import { ApiError, apiAssignmentProgress, apiGenerateAssignments, apiRankings, validationDetailsMessage } from '@/lib/api-client'

export interface ProgressRow {
  judgeId: string
  name: string | null
  email: string
  assigned: number
  completed: number
  pending: number
}

export interface RankingRow {
  submissionId: string
  title: string
  teamName: string
  scoreCount: number
  raw: number
  zScore: number
  minMax: number
  trimmedMean: number
}

function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'FORBIDDEN') return 'Only organizers can run assignments.'
    if (error.code === 'NETWORK_ERROR') return 'Request failed. Is the server running?'
    if (error.code === 'VALIDATION_ERROR') return validationDetailsMessage(error) ?? 'Check the input.'
  }
  return 'Request failed. Try again.'
}

// Assignments: generate button (uses the event's selected algorithm),
// per-judge progress, ranked table, and streaming CSV export.
export function AssignmentsPanel({
  eventId,
  initialProgress,
  initialRankings,
  onChanged,
}: {
  eventId: string
  initialProgress: ProgressRow[]
  initialRankings: RankingRow[]
  onChanged: () => void
}) {
  const [progress, setProgress] = useState(initialProgress)
  const [rankings, setRankings] = useState(initialRankings)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [rankPage, setRankPage] = useState(0)
  const RANK_PAGE_SIZE = 10
  const rankPageCount = Math.max(1, Math.ceil(rankings.length / RANK_PAGE_SIZE))
  const safeRankPage = Math.min(rankPage, rankPageCount - 1)
  const rankRows = rankings.slice(safeRankPage * RANK_PAGE_SIZE, safeRankPage * RANK_PAGE_SIZE + RANK_PAGE_SIZE)

  async function generate() {
    setWorking(true)
    setError(null)
    try {
      const result = await apiGenerateAssignments(eventId)
      setNotice(
        `Created ${result.assignmentsCreated} assignment(s).` +
          (result.unresolved.length > 0
            ? ` ${result.unresolved.length} submission(s) still need reviewers.` +
              (result.assignmentsCreated === 0
                ? ' Check that judges are qualified for tracks and not all conflicted.'
                : '')
            : ' Every submission is covered.'),
      )
      const [freshProgress, freshRankings] = await Promise.all([
        apiAssignmentProgress(eventId),
        apiRankings(eventId),
      ])
      setProgress(freshProgress.judges)
      setRankings(freshRankings.rankings)
      setRankPage(0)
      onChanged()
    } catch (err) {
      setError(message(err))
    } finally {
      setWorking(false)
    }
  }

  return (
    <section aria-label="Assignments" className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-bold text-foreground">Assignments</h3>
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={working}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#16a34a] px-4 text-[12px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
          >
            <Play size={14} strokeWidth={1.8} aria-hidden="true" />
            {working ? 'Generating…' : 'Generate assignments'}
          </button>
          <a
            href={`/api/export.csv?eventId=${eventId}`}
            download
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-4 text-[12px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            <Download size={14} strokeWidth={1.8} aria-hidden="true" /> Export CSV
          </a>
        </span>
      </div>
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
      <h4 className="mt-4 text-[13px] font-bold text-foreground">Judge progress</h4>
      {progress.length === 0 ? (
        <p className="mt-1 text-[13px] text-muted-foreground">No judges yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[12px] text-muted-foreground">
                <th className="px-4 py-2 font-bold">Judge</th>
                <th className="px-4 py-2 font-bold">Assigned</th>
                <th className="px-4 py-2 font-bold">Scored</th>
                <th className="px-4 py-2 font-bold">Pending</th>
              </tr>
            </thead>
            <tbody>
              {progress.map((row) => (
                <tr key={row.judgeId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-semibold text-foreground">{row.name ?? row.email}</td>
                  <td className="px-4 py-2 text-muted-foreground">{row.assigned}</td>
                  <td className="px-4 py-2 text-muted-foreground">{row.completed}</td>
                  <td className="px-4 py-2 text-muted-foreground">{row.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex items-center gap-2">
        <h4 className="text-[13px] font-bold text-foreground">Rankings</h4>
        {rankPageCount > 1 && (
          <span className="ml-auto flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <button
              type="button"
              onClick={() => setRankPage((page) => Math.max(0, page - 1))}
              disabled={safeRankPage === 0}
              className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              Prev
            </button>
            <span className="font-semibold">
              Page {safeRankPage + 1} of {rankPageCount}
            </span>
            <button
              type="button"
              onClick={() => setRankPage((page) => Math.min(rankPageCount - 1, page + 1))}
              disabled={safeRankPage >= rankPageCount - 1}
              className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              Next
            </button>
          </span>
        )}
      </div>
      {rankings.length === 0 ? (
        <p className="mt-1 text-[13px] text-muted-foreground">No finalized submissions to rank yet.</p>
      ) : (
        <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-border">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-[12px] text-muted-foreground">
                <th className="bg-card px-4 py-2 font-bold">Project</th>
                <th className="bg-card px-4 py-2 font-bold">Team</th>
                <th className="bg-card px-4 py-2 font-bold">Reviews</th>
                <th className="bg-card px-4 py-2 font-bold">Raw</th>
                <th className="bg-card px-4 py-2 font-bold">Z-score</th>
                <th className="bg-card px-4 py-2 font-bold">Min-max</th>
                <th className="bg-card px-4 py-2 font-bold">Trimmed</th>
              </tr>
            </thead>
            <tbody>
              {rankRows.map((row) => (
                <tr key={row.submissionId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-semibold text-foreground">{row.title}</td>
                  <td className="px-4 py-2 text-muted-foreground">{row.teamName}</td>
                  <td className="px-4 py-2 text-muted-foreground">{row.scoreCount}</td>
                  <td className="px-4 py-2 text-muted-foreground">{row.raw.toFixed(2)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{row.zScore.toFixed(2)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{row.minMax.toFixed(2)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{row.trimmedMean.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
