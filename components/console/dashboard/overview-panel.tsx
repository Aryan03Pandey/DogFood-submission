'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck,
  FolderGit2,
  Globe,
  Heart,
  HelpCircle,
  MapPin,
  Pencil,
  Search,
  Sparkles,
  Users,
  Shield,
  History,
  CopyCheck,
} from 'lucide-react'
import Link from 'next/link'
import type { serializeEvent } from '@/src/server/event-service'
import type { DashboardOverview, DashboardTab } from './types'

type ConsoleEvent = ReturnType<typeof serializeEvent>

interface OverviewPanelProps {
  overview: DashboardOverview
  event: ConsoleEvent
  onNavigateTab?: (tab: DashboardTab) => void
}

function Tier3OrganizerTools({ eventId }: { eventId: string }) {
  const [logs, setLogs] = useState<any[] | null>(null)
  const [duplicates, setDuplicates] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function fetchAuditLogs() {
    setLoading(true)
    try {
      const res = await fetch(`/api/events/${eventId}/audit-logs`)
      const data = await res.json()
      setLogs(data.logs ?? [])
      setDuplicates(null)
    } finally {
      setLoading(false)
    }
  }

  async function fetchDuplicates() {
    setLoading(true)
    try {
      const res = await fetch(`/api/events/${eventId}/duplicates`)
      const data = await res.json()
      setDuplicates(data.duplicates ?? [])
      setLogs(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-sm">Integrity & Audit Inspector</h3>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={fetchAuditLogs}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <History className="h-3.5 w-3.5" />
            View Audit Log
          </button>
          <button
            type="button"
            onClick={fetchDuplicates}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <CopyCheck className="h-3.5 w-3.5" />
            Check Duplicates
          </button>
        </div>
      </div>

      {loading && <div className="py-4 text-center text-xs text-muted-foreground">Loading audit data...</div>}

      {logs && (
        <div className="mt-4 space-y-2">
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            Append-Only Audit Event Trail ({logs.length} events)
          </h4>
          <div className="max-h-72 overflow-y-auto divide-y divide-border rounded-xl border border-border text-xs">
            {logs.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">No audit entries recorded yet.</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="p-3 flex items-start justify-between gap-4 hover:bg-muted/40 font-mono">
                  <div>
                    <span className="font-bold text-primary">{log.action}</span>
                    <span className="text-muted-foreground ml-2">[{log.entityType}]</span>
                    {log.payloadJson && (
                      <pre className="mt-1 text-[11px] text-muted-foreground overflow-x-auto max-w-xl">
                        {JSON.stringify(log.payloadJson)}
                      </pre>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {duplicates && (
        <div className="mt-4 space-y-2">
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            Text-Similarity Plagiarism Scanner
          </h4>
          <div className="divide-y divide-border rounded-xl border border-border text-xs">
            {duplicates.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                No potential duplicates detected among submitted projects.
              </div>
            ) : (
              duplicates.map((dup, i) => (
                <div key={i} className="p-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-foreground">
                      "{dup.submissionA.title}" <span className="text-muted-foreground">vs</span> "{dup.submissionB.title}"
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Teams: {dup.submissionA.teamName} / {dup.submissionB.teamName}
                    </div>
                  </div>
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 font-mono text-xs font-bold text-amber-600">
                    {Math.round(dup.similarityScore * 100)}% match
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function OverviewPanel({ overview, event, onNavigateTab }: OverviewPanelProps) {
  const draft = event.status === 'DRAFT'
  const router = useRouter()
  // The console page renders without a handler; fall back to tab URLs so
  // Review & publish and the stat cards always navigate somewhere.
  const goTab =
    onNavigateTab ??
    ((tab: DashboardTab) => router.push(`/console?eventId=${event.id}&tab=${tab}`))

  const statCards = [
    {
      label: 'Registrations',
      value: String(overview.totalParticipants),
      meta: `${overview.totalTeams} teams`,
      tab: 'participants' as DashboardTab,
      icon: Users,
    },
    {
      label: 'Submissions',
      value: String(overview.totalSubmissions),
      meta: `${overview.activeSubmissions} public, ${overview.hiddenSubmissions} hidden`,
      tab: 'submissions' as DashboardTab,
      icon: FolderGit2,
    },
    {
      label: 'Judges assigned',
      value: String(overview.totalJudges),
      meta: 'Across all tracks',
      tab: 'judging' as DashboardTab,
      icon: FileCheck,
    },
    {
      label: 'Community votes',
      value: String(overview.totalVotes),
      meta:
        event.status === 'PUBLIC_VOTING'
          ? 'Live now'
          : event.status === 'DRAFT'
            ? 'Not open'
            : 'Closed',
      icon: Heart,
    },
  ]

  const phaseProgress = [
    {
      label: 'Registration',
      date: event.registrationEnd,
      done: Boolean(event.registrationEnd && new Date(event.registrationEnd) < new Date()),
    },
    {
      label: 'Submission',
      date: event.submissionDeadline,
      done: Boolean(event.submissionDeadline && new Date(event.submissionDeadline) < new Date()),
    },
    {
      label: 'Judging',
      date: event.judgingEndTime,
      done: Boolean(event.judgingEndTime && new Date(event.judgingEndTime) < new Date()),
    },
    {
      label: 'Winners announced',
      date: event.announcementDate,
      done: Boolean(event.announcementDate && new Date(event.announcementDate) < new Date()),
    },
  ]

  return (
    <div className="space-y-6">
      {draft && (
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Your hackathon is in draft mode
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Review your timeline, tracks, and prizes. When you’re ready, publish
                the hackathon to open it for participants.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => goTab('settings')}
            className="shrink-0 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90"
          >
            Review & publish
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((c) => {
          const Icon = c.icon
          const clickable = Boolean(c.tab)
          return (
            <button
              key={c.label}
              type="button"
              disabled={!clickable}
              onClick={() => c.tab && goTab(c.tab)}
              className={`rounded-2xl border border-border bg-card p-5 text-left transition-colors ${
                clickable ? 'hover:border-primary/40 hover:bg-muted/40' : ''
              }`}
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">{c.label}</span>
                <Icon className="h-4 w-4" />
              </div>
              <div className="mt-3 text-2xl font-bold tracking-tight text-foreground">
                {c.value}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">{c.meta}</div>
            </button>
          )
        })}
      </div>

      {!event.publicVotingStart && !event.publicVotingEndTime && (
        <p className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-[13px] text-muted-foreground">
          Public voting is not enabled for this event. Set a public voting window in Event Settings to open
          community voting.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Timeline</h3>
              <p className="text-xs text-muted-foreground">Key dates across the hackathon lifecycle</p>
            </div>
            <Link
              href={`/hackathons/${event.slug}`}
              target="_blank"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Public page
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {phaseProgress.map((p, idx) => (
              <div key={p.label} className="flex items-center gap-4">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                    p.done
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-muted/30 text-muted-foreground'
                  }`}
                >
                  {p.done ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-bold">{idx + 1}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{p.label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {p.date ? new Date(p.date).toLocaleDateString(undefined, { timeZone: 'UTC' }) : 'Not scheduled'}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        p.done ? 'w-full bg-primary' : 'w-0'
                      }`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Event metadata
            </h3>
            <dl className="mt-4 space-y-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" /> Format
                </dt>
                <dd className="font-medium text-foreground">{event.format}</dd>
              </div>
              <div className="flex items-start justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> Participation
                </dt>
                <dd className="font-medium text-foreground">
                  {event.participationType} ({event.minTeamSize}-{event.maxTeamSize})
                </dd>
              </div>
              <div className="flex items-start justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" /> Status
                </dt>
                <dd className="font-semibold text-primary">{event.status}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Quick actions
            </h3>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => goTab('settings')}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                Edit event details & dates
              </button>
              <Link
                href={`/console/events/${event.id}/edit`}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                Edit event
              </Link>
              <button
                type="button"
                onClick={() => goTab('submissions')}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted"
              >
                <FolderGit2 className="h-3.5 w-3.5 text-muted-foreground" />
                Review submissions
              </button>
            </div>
          </div>
        </div>
      </div>

      <Tier3OrganizerTools eventId={event.id} />
    </div>
  )
}