'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'

export interface BallotItem {
  id: string
  title: string
  tagline: string | null
  description: string | null
  repoUrl: string | null
  demoUrl: string | null
  techStack: string[] | null
  assetKeys: unknown
  teamName: string
  trackName: string
}

interface BoothState {
  eventId: string
  status: string
  blindVoting: boolean
  isLiveTallyHidden: boolean
  myVotes: Array<{ submissionId: string }>
  results: Array<{
    submissionId: string
    title: string
    teamName: string
    trackName: string
    totalVotes: number
    voterCount: number
  }> | null
}

// Shared single-choice ballot logic: one upvote per project, many projects
// per voter. Toggling submits immediately; removing the last upvote resets
// the ballot. Anti-abuse fields (honeypot + render time) ride every submit.
export function useVotingBooth(eventId: string) {
  const [loading, setLoading] = useState(true)
  const [votingState, setVotingState] = useState<BoothState | null>(null)
  const [items, setItems] = useState<BallotItem[]>([])
  const [upvoted, setUpvoted] = useState<string[]>([])
  const [honeypotValue, setHoneypotValue] = useState('')
  const [mountTime] = useState(Date.now())
  const [isPending, startTransition] = useTransition()

  const loadData = useCallback(
    async (customSeed?: string) => {
      setLoading(true)
      try {
        const stateRes = await fetch(`/api/events/${eventId}/votes`)
        const stateData = await stateRes.json()
        setVotingState(stateData)

        const seedQuery = customSeed ? `?seed=${encodeURIComponent(customSeed)}` : ''
        const itemsRes = await fetch(`/api/events/${eventId}/voting-items${seedQuery}`)
        const itemsData = await itemsRes.json()
        setItems(itemsData.items ?? [])

        setUpvoted((stateData.myVotes ?? []).map((v: { submissionId: string }) => v.submissionId))
      } catch {
        // Loading failures surface through the empty project list; the
        // booth shows no toasts, so there is nothing to set here.
      } finally {
        setLoading(false)
      }
    },
    [eventId],
  )

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Optimistic-only toggle: the button flips immediately and nothing else
  // re-renders — no toasts, no list/detail refetch, so the page and footer
  // stay put. A failed submit quietly rolls the button back to its prior
  // state instead of announcing an error.
  function toggleUpvote(submissionId: string) {
    const prev = upvoted
    const next = prev.includes(submissionId)
      ? prev.filter((id) => id !== submissionId)
      : [...prev, submissionId]
    setUpvoted(next)
    startTransition(async () => {
      try {
        const res =
          next.length === 0
            ? await fetch(`/api/events/${eventId}/vote`, { method: 'DELETE' })
            : await fetch(`/api/events/${eventId}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  allocations: next.map((id) => ({ submissionId: id, votes: 1 })),
                  honeypot: honeypotValue,
                  formRenderedAt: mountTime,
                }),
              })
        if (!res.ok) setUpvoted(prev)
      } catch {
        setUpvoted(prev)
      }
    })
  }

  function reshuffle() {
    void loadData(Math.random().toString(36).substring(7))
  }

  return {
    loading,
    votingState,
    items,
    upvoted,
    honeypotValue,
    setHoneypotValue,
    isPending,
    toggleUpvote,
    reshuffle,
  }
}
