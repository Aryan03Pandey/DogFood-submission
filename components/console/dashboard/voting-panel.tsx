'use client'

import { useState } from 'react'

import type { VotingAnalytics } from '@/src/server/voting-service'

const PAGE_SIZE = 10

// Admin Voting tab: turnout stats, vote distribution chart, and the full
// per-submission leaderboard (paginated, fixed height). Organizers always
// see the true tally, even while blind voting hides it from the public.
export function VotingPanel({ initial }: { initial: VotingAnalytics }) {
  const [page, setPage] = useState(0)
  const { leaderboard } = initial
  const pageCount = Math.max(1, Math.ceil(leaderboard.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const rows = leaderboard.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const maxVotes = Math.max(1, ...leaderboard.map((row) => row.totalVotes))

  const stats = [
    { label: 'Total votes', value: String(initial.totalVotes) },
    { label: 'Voters', value: String(initial.totalVoters) },
    { label: 'Submissions with votes', value: `${initial.votedSubmissions} / ${leaderboard.length}` },
    { label: 'Comments', value: String(initial.totalComments) },
  ]

  return (
    <section aria-label="Voting" className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-[15px] font-bold text-foreground">Community voting</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Single choice upvoting
          {' · '}
          {initial.status}
          {initial.blindVoting ? ' · blind counts' : ''}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-[20px] font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {!initial.votingEnabled && (
        <p className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-[13px] text-muted-foreground">
          Public voting is not enabled for this event. Set a public voting window in Event Settings to open
          community voting.
        </p>
      )}

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-[15px] font-bold text-foreground">Vote distribution</h3>
        {leaderboard.every((row) => row.totalVotes === 0) ? (
          <p className="mt-1 text-[13px] text-muted-foreground">No votes yet.</p>
        ) : (
          <ul className="mt-3 flex max-h-64 flex-col gap-2 overflow-y-auto">
            {leaderboard
              .filter((row) => row.totalVotes > 0)
              .slice(0, 12)
              .map((row, index) => (
                <li key={row.submissionId} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-[12px] font-semibold text-foreground">{row.title}</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={`block h-full rounded-full ${index === 0 ? 'bg-[#16a34a]' : 'bg-foreground/60'}`}
                      style={{ width: `${Math.max(2, (row.totalVotes / maxVotes) * 100)}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right font-mono text-[12px] font-bold text-foreground">
                    {row.totalVotes}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold text-foreground">Leaderboard</h3>
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
        {leaderboard.length === 0 ? (
          <p className="mt-1 text-[13px] text-muted-foreground">No finalized submissions to rank yet.</p>
        ) : (
          <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-[12px] text-muted-foreground">
                  <th scope="col" className="bg-card px-4 py-2 font-bold">Project</th>
                  <th scope="col" className="bg-card px-4 py-2 font-bold">Team</th>
                  <th scope="col" className="bg-card px-4 py-2 font-bold">Votes</th>
                  <th scope="col" className="bg-card px-4 py-2 font-bold">Voters</th>
                  <th scope="col" className="bg-card px-4 py-2 font-bold">Comments</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.submissionId} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-semibold text-foreground">{row.title}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.teamName}</td>
                    <td className="px-4 py-2 font-mono font-bold text-foreground">{row.totalVotes}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.voterCount}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.commentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
