'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, CopyCheck, Download, ExternalLink, Search } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  ApiError,
  apiDetectDuplicates,
  apiListDashboardSubmissions,
  type DashboardSubmissionPayload,
  type DuplicatePairPayload,
} from '@/lib/api-client'

const PAGE_SIZE = 10

// Submissions tab: searchable, filterable, paginated table — one row per
// team (or individual) submission with draft/final status, plus CSV export.
export function SubmissionsPanel({
  eventId,
  initialRows,
  initialTotal,
  tracks,
}: {
  eventId: string
  initialRows: DashboardSubmissionPayload[]
  initialTotal: number
  tracks: string[]
}) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'draft' | 'final'>('all')
  const [track, setTrack] = useState('all')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState(initialRows)
  const [total, setTotal] = useState(initialTotal)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicates, setDuplicates] = useState<DuplicatePairPayload[] | null>(null)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, status, track])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setPending(true)
      setError(null)
      try {
        const result = await apiListDashboardSubmissions(eventId, {
          page,
          pageSize: PAGE_SIZE,
          query: debouncedQuery === '' ? undefined : debouncedQuery,
          status: status === 'all' ? undefined : status,
          track: track === 'all' ? undefined : track,
        })
        if (!cancelled) {
          setRows(result.submissions)
          setTotal(result.total)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? 'Could not load submissions. Try again.' : 'Could not load submissions. Try again.')
        }
      } finally {
        if (!cancelled) setPending(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [eventId, page, debouncedQuery, status, track])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search
            size={15}
            strokeWidth={1.8}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <label htmlFor="submissions-search" className="sr-only">
            Search submissions
          </label>
          <input
            id="submissions-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search project, team, or track…"
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
          />
        </div>
        <label htmlFor="submissions-status" className="sr-only">
          Filter by status
        </label>
        <select
          id="submissions-status"
          value={status}
          onChange={(event) => setStatus(event.target.value as 'all' | 'draft' | 'final')}
          className="h-10 rounded-lg border border-border bg-background px-3 text-[13px] font-semibold text-foreground outline-none focus:border-[#16a34a]"
        >
          <option value="all">All statuses</option>
          <option value="final">Final</option>
          <option value="draft">Draft</option>
        </select>
        <label htmlFor="submissions-track" className="sr-only">
          Filter by track
        </label>
        <select
          id="submissions-track"
          value={track}
          onChange={(event) => setTrack(event.target.value)}
          className="h-10 max-w-52 rounded-lg border border-border bg-background px-3 text-[13px] font-semibold text-foreground outline-none focus:border-[#16a34a]"
        >
          <option value="all">All tracks</option>
          {tracks.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <a
          href={`/api/events/${eventId}/submissions/export`}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d]"
        >
          <Download size={15} strokeWidth={1.8} aria-hidden="true" /> Export to CSV
        </a>
        <button
          type="button"
          disabled={scanning}
          onClick={() => {
            setScanning(true)
            apiDetectDuplicates(eventId)
              .then(({ duplicates }) => setDuplicates(duplicates))
              .catch(() => setError('Could not scan for duplicates. Try again.'))
              .finally(() => setScanning(false))
          }}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <CopyCheck size={15} strokeWidth={1.8} aria-hidden="true" />
          {scanning ? 'Scanning…' : 'Check duplicates'}
        </button>
      </div>

      {duplicates !== null && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-[13px] font-bold text-foreground">
            Potential duplicates ({duplicates.length})
          </h3>
          {duplicates.length === 0 ? (
            <p className="mt-1 text-[13px] text-muted-foreground">
              No potential duplicates detected among submitted projects.
            </p>
          ) : (
            <ul className="mt-2 flex max-h-64 flex-col gap-2 overflow-y-auto">
              {duplicates.map((dup, index) => (
                <li
                  key={`${dup.submissionA.id}-${dup.submissionB.id}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2"
                >
                  <p className="min-w-0 text-[13px] text-foreground">
                    <span className="font-bold">{dup.submissionA.title}</span>
                    <span className="text-muted-foreground"> ({dup.submissionA.teamName})</span>
                    <span className="text-muted-foreground"> vs </span>
                    <span className="font-bold">{dup.submissionB.title}</span>
                    <span className="text-muted-foreground"> ({dup.submissionB.teamName})</span>
                  </p>
                  <span className="shrink-0 font-mono text-[12px] font-bold text-foreground">
                    {Math.round(dup.similarityScore * 100)}% match
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-border">
              {['Project', 'Team', 'Track', 'Status', 'Submitted', 'Links'].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {total === 0 && query === '' && status === 'all' && track === 'all'
                    ? 'No submissions yet.'
                    : 'No submissions match these filters.'}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold text-foreground">{row.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.teamName}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.trackName}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'rounded-full px-2 py-1 text-[11px] font-bold capitalize',
                      row.status === 'final'
                        ? 'bg-[#16a34a]/10 text-[#16a34a] dark:text-[#22c55e]'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {row.status}
                  </span>
                  {row.isHidden && (
                    <span className="ml-2 rounded-full bg-muted px-2 py-1 text-[11px] font-bold text-muted-foreground">
                      Hidden
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.submittedAt
                    ? new Date(row.submittedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        timeZone: 'UTC',
                      })
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className="flex gap-3">
                    {row.repoUrl && (
                      <Link
                        href={row.repoUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`Repository for ${row.title}`}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#16a34a] hover:underline dark:text-[#22c55e]"
                      >
                        <ExternalLink size={13} strokeWidth={1.8} aria-hidden="true" /> Repo
                      </Link>
                    )}
                    {row.demoUrl && (
                      <Link
                        href={row.demoUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`Demo for ${row.title}`}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#16a34a] hover:underline dark:text-[#22c55e]"
                      >
                        <ExternalLink size={13} strokeWidth={1.8} aria-hidden="true" /> Demo
                      </Link>
                    )}
                    {!row.repoUrl && !row.demoUrl && <span className="text-muted-foreground">—</span>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-[12px] text-muted-foreground" role="status">
          Showing {from}–{to} of {total} submission{total === 1 ? '' : 's'}
          {pending ? '…' : ''}.
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1 || pending}
            aria-label="Previous page"
            className="flex size-9 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <span className="min-w-20 text-center text-[12px] font-semibold text-muted-foreground" aria-label={`Page ${page} of ${totalPages}`}>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages || pending}
            aria-label="Next page"
            className="flex size-9 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
