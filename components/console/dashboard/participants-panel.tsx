'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpDown, Download, ListChecks, Search } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { DashboardParticipantPayload } from '@/lib/api-client'

type SortKey = 'name' | 'email' | 'team' | 'registered'

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'name', label: 'Participant' },
  { key: 'email', label: 'Email' },
  { key: 'team', label: 'Team' },
  { key: 'registered', label: 'Registered' },
]

// Participants tab: searchable table, sortable on every field, shortlist
// entry point, and CSV export.
export function ParticipantsPanel({
  eventId,
  rows,
}: {
  eventId: string
  rows: DashboardParticipantPayload[]
}) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('registered')
  const [ascending, setAscending] = useState(false)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const kept = rows.filter(
      (row) =>
        needle === '' ||
        row.email.toLowerCase().includes(needle) ||
        (row.name ?? '').toLowerCase().includes(needle) ||
        (row.teamName ?? '').toLowerCase().includes(needle),
    )
    const value = (row: DashboardParticipantPayload): string => {
      switch (sortKey) {
        case 'name':
          return (row.name ?? row.email).toLowerCase()
        case 'email':
          return row.email.toLowerCase()
        case 'team':
          return (row.teamName ?? '').toLowerCase()
        case 'registered':
          return row.registeredAt
      }
    }
    return [...kept].sort((a, b) => {
      const order = value(a).localeCompare(value(b))
      return ascending ? order : -order
    })
  }, [rows, query, sortKey, ascending])

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setAscending(!ascending)
    } else {
      setSortKey(key)
      setAscending(true)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search
            size={15}
            strokeWidth={1.8}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, team, or email…"
            aria-label="Search participants"
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
          />
        </div>
        <Link
          href={`/console/events/${eventId}/shortlist`}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
        >
          <ListChecks size={15} strokeWidth={1.8} aria-hidden="true" /> Shortlist candidates
        </Link>
        <a
          href={`/api/events/${eventId}/participants/export`}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d]"
        >
          <Download size={15} strokeWidth={1.8} aria-hidden="true" /> Export to CSV
        </a>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-border">
              {COLUMNS.map((column) => (
                <th key={column.key} scope="col" className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    aria-label={`Sort by ${column.label}`}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {column.label}
                    <ArrowUpDown
                      size={12}
                      strokeWidth={2}
                      aria-hidden="true"
                      className={cn(sortKey === column.key && 'text-[#16a34a]')}
                    />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  {rows.length === 0 ? 'No participants yet.' : 'No participants match this search.'}
                </td>
              </tr>
            )}
            {filtered.map((row) => (
              <tr key={row.userId} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold text-foreground">{row.name ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.email}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.teamName ?? 'Individual'}
                  {row.memberRole && row.memberRole !== 'MEMBER' && (
                    <span className="ml-2 rounded-full bg-muted px-1.5 py-px text-[10px] font-bold capitalize">
                      {row.memberRole.toLowerCase()}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(row.registeredAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-muted-foreground" role="status">
        Showing {filtered.length} of {rows.length} participants.
      </p>
    </div>
  )
}
