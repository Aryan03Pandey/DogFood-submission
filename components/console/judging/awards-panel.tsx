'use client'

import { useState } from 'react'
import { Trash2, Trophy } from 'lucide-react'

import {
  ApiError,
  apiAwardPrize,
  apiListPrizeAwards,
  apiRevokePrizeAward,
  type PrizeAwardPayload,
  type PrizePayload,
} from '@/lib/api-client'

function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'PRIZE_ALREADY_AWARDED') return 'That prize already has a winner. Revoke it first to reassign.'
    if (error.code === 'FORBIDDEN') return 'Only organizers can manage awards.'
    if (error.code === 'PRIZE_NOT_FOUND' || error.code === 'SUBMISSION_NOT_FOUND') return 'That prize or submission no longer exists.'
    if (error.code === 'NETWORK_ERROR') return 'Request failed. Is the server running?'
  }
  return 'Request failed. Try again.'
}

// Tier 4.7. Organizer-only: pick a prize and a finalized submission to
// record a winner (a signed certificate then becomes downloadable for that
// submission's team from their own submission page). Only submissions that
// have finished submitting are offered — a draft can't win a prize.
export function AwardsPanel({
  eventId,
  prizes,
  finalSubmissions,
  initialAwards,
  onChanged,
}: {
  eventId: string
  prizes: PrizePayload[]
  finalSubmissions: Array<{ id: string; title: string; teamName: string }>
  initialAwards: PrizeAwardPayload[]
  onChanged: () => void
}) {
  const [awards, setAwards] = useState(initialAwards)
  const [prizeId, setPrizeId] = useState('')
  const [submissionId, setSubmissionId] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const awardedPrizeIds = new Set(awards.map((award) => award.prizeId))
  const availablePrizes = prizes.filter((prize) => !awardedPrizeIds.has(prize.id))

  async function refresh() {
    const { awards } = await apiListPrizeAwards(eventId)
    setAwards(awards)
  }

  async function award() {
    if (!prizeId || !submissionId || working) return
    setWorking(true)
    setError(null)
    try {
      await apiAwardPrize(eventId, { prizeId, submissionId })
      setPrizeId('')
      setSubmissionId('')
      setNotice('Winner recorded.')
      await refresh()
      onChanged()
    } catch (err) {
      setError(message(err))
    } finally {
      setWorking(false)
    }
  }

  async function revoke(awardId: string) {
    setWorking(true)
    setError(null)
    try {
      await apiRevokePrizeAward(eventId, awardId)
      setNotice('Award revoked.')
      await refresh()
      onChanged()
    } catch (err) {
      setError(message(err))
    } finally {
      setWorking(false)
    }
  }

  return (
    <section aria-label="Awards" className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-[15px] font-bold text-foreground">Awards</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Record which submission won each prize. A signed winner certificate becomes downloadable
        for that team once recorded.
      </p>
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

      {prizes.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">No prizes configured for this event yet.</p>
      ) : (
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void award()
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="award-prize" className="text-[12px] font-semibold text-muted-foreground">
              Prize
            </label>
            <select
              id="award-prize"
              value={prizeId}
              onChange={(event) => setPrizeId(event.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-[#16a34a]"
            >
              <option value="">Select a prize…</option>
              {availablePrizes.map((prize) => (
                <option key={prize.id} value={prize.id}>
                  {prize.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="award-submission" className="text-[12px] font-semibold text-muted-foreground">
              Winning submission
            </label>
            <select
              id="award-submission"
              value={submissionId}
              onChange={(event) => setSubmissionId(event.target.value)}
              className="h-10 min-w-56 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-[#16a34a]"
            >
              <option value="">Select a submission…</option>
              {finalSubmissions.map((submission) => (
                <option key={submission.id} value={submission.id}>
                  {submission.title} — {submission.teamName}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={working || !prizeId || !submissionId}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#16a34a] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
          >
            <Trophy size={15} strokeWidth={1.8} aria-hidden="true" /> Record winner
          </button>
        </form>
      )}

      <h4 className="mt-5 text-[13px] font-bold text-foreground">Recorded winners ({awards.length})</h4>
      {awards.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">No winners recorded yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {awards.map((award) => (
            <li key={award.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-foreground">{award.prizeTitle}</span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {award.submissionTitle} — {award.teamName}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void revoke(award.id)}
                disabled={working}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-[12px] font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
              >
                <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
