'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, ExternalLink, Trophy, Vote } from 'lucide-react'

import { SubmissionComments } from './submission-comments'
import { SubmissionAssets } from '@/components/submission/submission-assets'
import { useVotingBooth, type BallotItem } from './use-voting-booth'

// Dedicated voting page: a master-detail booth. The left third holds the
// scrollable project list in per-session shuffled order (position-bias
// mitigation); the right two thirds show the selected project's full
// details — same body judges see: tech stack, links, asset gallery with
// embedded video — followed by its upvote button and the discussion thread.
export function VotingBoothPage({
  eventId,
  eventSlug,
  eventTitle,
  assetBase,
  bucket,
}: {
  eventId: string
  eventSlug: string
  eventTitle: string
  assetBase: string
  bucket: string
}) {
  const {
    loading,
    votingState,
    items,
    upvoted,
    honeypotValue,
    setHoneypotValue,
    isPending,
    toggleUpvote,
    reshuffle,
  } = useVotingBooth(eventId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const actionBarRef = useRef<HTMLDivElement | null>(null)
  const [listMaxHeight, setListMaxHeight] = useState<number | null>(null)

  useEffect(() => {
    if (!selectedId && items.length > 0) setSelectedId(items[0].id)
  }, [items, selectedId])

  // Fit the scrollable project list in the remaining viewport:
  // screen height − sticky navbar height − top action bar height − 4rem.
  // Both chrome heights are measured live (the action bar wraps on narrow
  // screens), so the list never pushes content below the fold.
  useEffect(() => {
    const compute = () => {
      const navbarHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 64
      const actionBarHeight = actionBarRef.current?.getBoundingClientRect().height ?? 0
      setListMaxHeight(Math.max(240, window.innerHeight - navbarHeight - actionBarHeight - 64))
    }
    compute()
    window.addEventListener('resize', compute)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(compute) : null
    if (actionBarRef.current) observer?.observe(actionBarRef.current)
    return () => {
      window.removeEventListener('resize', compute)
      observer?.disconnect()
    }
  }, [])

  const selected: BallotItem | null = items.find((item) => item.id === selectedId) ?? null
  const hasUpvote = selected ? upvoted.includes(selected.id) : false

  if (loading) {
    return <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading voting booth...</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div ref={actionBarRef} className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <a
            href={`/hackathons/${eventSlug}`}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" /> Back to event
          </a>
          <div>
            <h2 className="text-[15px] font-bold text-foreground">Vote · {eventTitle}</h2>
            <p className="text-[12px] text-muted-foreground">
              Upvote as many projects as you like — one upvote per project.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/hackathons/${eventSlug}/vote/leaderboard`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-muted"
          >
            <Trophy size={13} strokeWidth={1.8} aria-hidden="true" />
            View leaderboard
          </a>
          <button
            type="button"
            onClick={reshuffle}
            title="Deterministic per-session seeded shuffle to eliminate list position bias"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-muted"
          >
            Reshuffle
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ul
            aria-label="Projects"
            className="flex max-h-[56rem] pr-4 flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-card p-3"
            style={listMaxHeight ? { maxHeight: listMaxHeight } : undefined}
          >
            {items.length === 0 && (
              <li className="p-4 text-center text-[13px] text-muted-foreground">No eligible submissions for voting.</li>
            )}
            {items.map((item, index) => {
              const active = item.id === selectedId
              const voted = upvoted.includes(item.id)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    aria-current={active}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      active ? 'border-foreground/30 bg-muted' : 'border-transparent hover:bg-muted/60'
                    }`}
                  >
                    <span className="font-mono text-[11px] text-muted-foreground">#{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-foreground">{item.title}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {item.trackName} · {item.teamName}
                      </span>
                    </span>
                    {voted && (
                      <span className="shrink-0 rounded-full bg-[#16a34a]/10 px-2 py-0.5 text-[11px] font-bold text-[#16a34a]">
                        Upvoted
                      </span>
                    )}
                    <ChevronRight size={14} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-muted-foreground" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="lg:col-span-2">
          {!selected ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-[13px] text-muted-foreground">
              Select a project to see its details.
            </div>
          ) : (
            <article className="rounded-xl border border-border bg-card p-6">
              <p className="text-[12px] font-bold text-muted-foreground">
                {selected.trackName} · By {selected.teamName}
              </p>
              <h3 className="mt-1 text-[20px] font-bold text-foreground">{selected.title}</h3>
              {selected.tagline && <p className="mt-1 text-[14px] text-muted-foreground">{selected.tagline}</p>}
              {selected.description && (
                <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">{selected.description}</p>
              )}
              {selected.techStack && selected.techStack.length > 0 && (
                <p className="mt-3 text-[12px] text-muted-foreground">
                  Stack: <span className="font-semibold text-foreground">{selected.techStack.join(', ')}</span>
                </p>
              )}
              {(selected.repoUrl || selected.demoUrl) && (
                <div className="mt-3 flex flex-wrap gap-3 text-[13px] font-bold">
                  {selected.repoUrl && (
                    <a href={selected.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#16a34a] hover:underline">
                      Repository <ExternalLink size={13} strokeWidth={1.8} aria-hidden="true" />
                    </a>
                  )}
                  {selected.demoUrl && (
                    <a href={selected.demoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#16a34a] hover:underline">
                      Live demo <ExternalLink size={13} strokeWidth={1.8} aria-hidden="true" />
                    </a>
                  )}
                </div>
              )}
              <SubmissionAssets assetKeys={selected.assetKeys} assetBase={assetBase} bucket={bucket} />
              <div className="mt-4">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => toggleUpvote(selected.id)}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-5 text-[13px] font-bold transition-colors disabled:opacity-60 ${
                    hasUpvote
                      ? 'bg-[#16a34a] text-white hover:bg-[#15803d]'
                      : 'border border-border text-foreground hover:bg-muted'
                  }`}
                >
                  <Vote size={14} strokeWidth={1.8} aria-hidden="true" />
                  {hasUpvote ? 'Upvoted — remove upvote' : 'Upvote this project'}
                </button>
              </div>
              <SubmissionComments eventId={eventId} submissionId={selected.id} />
            </article>
          )}
        </div>
      </div>

      <input
        type="text"
        name="company_website_url_hp"
        value={honeypotValue}
        onChange={(e) => setHoneypotValue(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}
        aria-hidden="true"
      />
    </div>
  )
}
