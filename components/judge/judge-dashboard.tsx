'use client'

import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Flag } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  ApiError,
  apiJudgeSubmission,
  type JudgeDetailPayload,
  type JudgeQueueItemPayload,
} from '@/lib/api-client'
import { SubmissionAssets } from '@/components/submission/submission-assets'
import { ScoringPanel } from './scoring-panel'

// Judge dashboard: three columns — assigned queue | submission detail |
// scoring. Column 2 is widest; columns 1 and 3 scroll independently while
// column 2 sizes to its content.
export function JudgeDashboard({
  initial,
  assetBase,
  bucket,
}: {
  initial: JudgeQueueItemPayload[]
  assetBase: string
  bucket: string
}) {
  const [queue, setQueue] = useState(initial)
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.submission.id ?? null)
  const [detail, setDetail] = useState<JudgeDetailPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Open the first assignment on mount so all three columns show content.
  useEffect(() => {
    const first = initial[0]?.submission.id
    if (first) void select(first)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const grouped = useMemo(() => {
    const groups = new Map<string, { title: string; items: JudgeQueueItemPayload[] }>()
    for (const item of queue) {
      const group = groups.get(item.event.id) ?? { title: item.event.title, items: [] }
      group.items.push(item)
      groups.set(item.event.id, group)
    }
    return [...groups.entries()]
  }, [queue])

  async function select(submissionId: string) {
    setSelectedId(submissionId)
    setLoading(true)
    setError(null)
    try {
      const fresh = await apiJudgeSubmission(submissionId)
      setDetail(fresh)
      // Keep the queue pills and overview counts live: scoring only
      // refreshes the detail payload, so mirror its state back.
      setQueue((items) =>
        items.map((item) =>
          item.submission.id === submissionId
            ? { ...item, scored: fresh.score !== null, flag: fresh.flag }
            : item,
        ),
      )
    } catch (err) {
      setError(err instanceof ApiError ? 'Could not load that submission.' : 'Request failed.')
    } finally {
      setLoading(false)
    }
  }

  async function refreshDetail() {
    if (selectedId) await select(selectedId)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
      <section aria-label="Assigned projects" className="lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-[15px] font-bold text-foreground">Assigned projects</h2>
          {queue.length === 0 && (
            <p className="mt-2 text-[13px] text-muted-foreground">No assignments yet.</p>
          )}
          {grouped.map(([eventId, group]) => (
            <div key={eventId} className="mt-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                {group.title}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {group.items.map((item) => {
                  const active = item.submission.id === selectedId
                  return (
                    <li key={item.assignmentId}>
                      <button
                        type="button"
                        onClick={() => void select(item.submission.id)}
                        aria-current={active ? 'true' : undefined}
                        className={cn(
                          'flex w-full flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
                          active
                            ? 'border-[#16a34a] bg-[#16a34a]/5'
                            : 'border-border bg-card hover:border-muted-foreground',
                        )}
                      >
                        <span className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
                          <span className="min-w-0 flex-1 truncate">{item.submission.title}</span>
                          {item.flag !== null && (
                            <Flag size={13} strokeWidth={2} aria-label="Flagged" className="shrink-0 text-destructive" />
                          )}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[11px] font-bold',
                              item.scored
                                ? 'bg-[#16a34a]/10 text-[#16a34a] dark:text-[#22c55e]'
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {item.scored ? 'Scored' : 'Not scored'}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{item.track.name}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Submission detail" className="min-w-0">
        <div className="rounded-xl border border-border bg-card p-6">
          {loading && <p className="text-[13px] text-muted-foreground">Loading submission…</p>}
          {error && (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[12px] font-semibold text-destructive">
              {error}
            </p>
          )}
          {!loading && !detail && selectedId === null && (
            <p className="text-[13px] text-muted-foreground">Select a project to review it.</p>
          )}
          {!loading && detail && (
            <article>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                {detail.track.name}
              </p>
              <h2 className="mt-1 text-[22px] font-bold tracking-[-0.02em] text-foreground">
                {detail.submission.title}
              </h2>
              {detail.submission.tagline && (
                <p className="mt-1 text-[14px] font-semibold text-foreground">{detail.submission.tagline}</p>
              )}
              {!detail.event.doubleBlindJudging && detail.team && (
                <div className="mt-3 rounded-lg border border-border p-3">
                  <p className="text-[12px] font-bold text-foreground">Team: {detail.team.name}</p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {detail.team.members.map((member) => (
                      <li key={member.id} className="text-[12px] text-muted-foreground">
                        {member.name ?? member.email} · {member.role}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {detail.event.doubleBlindJudging && (
                <p className="mt-3 rounded-lg border border-border bg-muted/50 p-3 text-[12px] font-semibold text-muted-foreground">
                  Team identity is hidden for blind review.
                </p>
              )}
              {detail.submission.description && (
                <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                  {detail.submission.description}
                </p>
              )}
              {detail.submission.techStack.length > 0 && (
                <p className="mt-3 text-[12px] text-muted-foreground">
                  Stack: <span className="font-semibold text-foreground">{detail.submission.techStack.join(', ')}</span>
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-3 text-[12px] font-bold">
                {detail.submission.repoUrl && (
                  <a href={detail.submission.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#16a34a] hover:underline">
                    Repository <ExternalLink size={12} strokeWidth={1.8} aria-hidden="true" />
                  </a>
                )}
                {detail.submission.demoUrl && (
                  <a href={detail.submission.demoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#16a34a] hover:underline">
                    Live demo <ExternalLink size={12} strokeWidth={1.8} aria-hidden="true" />
                  </a>
                )}
              </div>
              <SubmissionAssets
                assetKeys={detail.submission.assetKeys}
                assetBase={assetBase}
                bucket={bucket}
              />
            </article>
          )}
        </div>
      </section>

      <section aria-label="Scoring" className="lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto">
        <div className="rounded-xl border border-border bg-card p-4">
          {detail === null ? (
            <p className="text-[13px] text-muted-foreground">Select a project to score it.</p>
          ) : (
            <ScoringPanel key={detail.assignmentId} detail={detail} onChanged={() => void refreshDetail()} />
          )}
        </div>
      </section>
    </div>
  )
}
