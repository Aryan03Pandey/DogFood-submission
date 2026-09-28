'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Copy, Plus, Ticket } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  ApiError,
  apiCreateTeam,
  apiJoinTeam,
  type TeamSummaryPayload,
} from '@/lib/api-client'

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.code === 'INVITE_INVALID') return 'That code matches no team. Check it and try again.'
  if (err instanceof ApiError && err.code === 'INVITE_EXPIRED') return 'That invite code has expired. Ask the leader for a new one.'
  if (err instanceof ApiError && err.code === 'TEAM_FULL') return 'That team is already full.'
  if (err instanceof ApiError && err.code === 'TEAM_LOCKED') return 'That team roster is locked.'
  if (err instanceof ApiError && err.code === 'TEAM_EXISTS') return 'You are already on a team for this event.'
  if (err instanceof ApiError && err.code === 'RATE_LIMITED') return 'Too many attempts. Wait a minute and try again.'
  if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') return 'Check the highlighted fields and try again.'
  return fallback
}

// Teamless view: the two doc cards — Create a Team and Join a Team.
// Creating returns the invite token once (only its hash is stored), shown
// with copy controls immediately.
export function TeamForms({
  eventId,
  slug,
  initialMode,
}: {
  eventId: string
  slug: string
  initialMode: 'create' | 'join'
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'create' | 'join'>(initialMode)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [created, setCreated] = useState<{ team: TeamSummaryPayload; token: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    if (working || name.trim() === '') return
    setWorking(true)
    setError(null)
    try {
      const result = await apiCreateTeam(eventId, name.trim())
      setCreated(result)
    } catch (err) {
      setError(errorMessage(err, 'Could not create the team. Try again.'))
    } finally {
      setWorking(false)
    }
  }

  async function join() {
    if (working || code.trim() === '') return
    setWorking(true)
    setError(null)
    try {
      await apiJoinTeam(eventId, code.trim())
      router.push(`/hackathons/${slug}/team`)
      router.refresh()
    } catch (err) {
      setError(errorMessage(err, 'Could not join the team. Try again.'))
    } finally {
      setWorking(false)
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  if (created) {
    const link = `/invite?token=${created.token}`
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-[15px] font-bold text-foreground">Team {created.team.team.name} created</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
          Share this invite code or link. It expires in 7 days — you can generate a new one
          anytime from the manage page.
        </p>
        <p className="mx-auto mt-4 inline-block rounded-lg bg-muted px-4 py-2 font-mono text-[15px] font-bold tracking-widest text-foreground">
          {created.token}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => copy(created.token)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-4 text-[12px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy code'}
          </button>
          <button
            type="button"
            onClick={() => copy(`${window.location.origin}${link}`)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-4 text-[12px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            <Copy size={14} aria-hidden="true" /> Copy invite link
          </button>
          <Link
            href={`/hackathons/${slug}/team`}
            className="inline-flex h-9 items-center rounded-lg bg-[#16a34a] px-4 text-[12px] font-bold text-white transition-colors hover:bg-[#15803d]"
          >
            Go to team
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2" role="tablist" aria-label="Create or join a team">
        {(['create', 'join'] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={mode === entry}
            onClick={() => {
              setMode(entry)
              setError(null)
            }}
            className={cn(
              'flex flex-col gap-1 rounded-xl border p-5 text-left transition-colors',
              mode === entry
                ? 'border-[#16a34a] bg-[#16a34a]/5'
                : 'border-border bg-card hover:border-muted-foreground',
            )}
          >
            <span className="flex items-center gap-2 text-[15px] font-bold text-foreground">
              {entry === 'create' ? <Plus size={16} aria-hidden="true" /> : <Ticket size={16} aria-hidden="true" />}
              {entry === 'create' ? 'Create a Team' : 'Join a Team'}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {entry === 'create'
                ? 'Name your team and invite others with a code.'
                : 'Paste an invite code to join a team.'}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card p-6">
        {mode === 'create' ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              create()
            }}
            className="flex flex-col gap-3"
          >
            <div>
              <label htmlFor="team-name" className="mb-1.5 block text-[13px] font-bold text-foreground">
                Team name
              </label>
              <input
                id="team-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Glass Signal"
                maxLength={80}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={working || name.trim() === ''}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
              >
                <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
                {working ? 'Creating…' : 'Create team'}
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              join()
            }}
            className="flex flex-col gap-3"
          >
            <div>
              <label htmlFor="invite-code" className="mb-1.5 block text-[13px] font-bold text-foreground">
                Invitation code
              </label>
              <input
                id="invite-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="DF-8X2F-3J9Q"
                autoComplete="off"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-[13px] tracking-widest text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={working || code.trim() === ''}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
              >
                <Ticket size={15} strokeWidth={1.8} aria-hidden="true" />
                {working ? 'Joining…' : 'Join team'}
              </button>
            </div>
          </form>
        )}
        {error && (
          <p role="alert" className="mt-3 text-[12px] font-semibold text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
