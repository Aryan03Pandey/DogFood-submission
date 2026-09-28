'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { ApiError, apiJoinTeam } from '@/lib/api-client'

// Join control on the invite landing page: one button POSTs the token from
// the link the user clicked. Expired codes never reach this button — the
// page says so instead.
export function InviteJoin({
  eventId,
  eventSlug,
  teamName,
  token,
}: {
  eventId: string
  eventSlug: string
  teamName: string
  token: string
}) {
  const router = useRouter()
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function join() {
    if (working) return
    setWorking(true)
    setError(null)
    try {
      await apiJoinTeam(eventId, token)
      router.push(`/hackathons/${eventSlug}/team`)
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UNAUTHORIZED') {
        router.push('/login')
      } else if (err instanceof ApiError && err.code === 'INVITE_EXPIRED') {
        setError('This invite code has expired. Ask the team leader for a new one.')
      } else if (err instanceof ApiError && err.code === 'TEAM_FULL') {
        setError('This team is already full.')
      } else if (err instanceof ApiError && err.code === 'TEAM_EXISTS') {
        router.push(`/hackathons/${eventSlug}/team`)
      } else if (err instanceof ApiError && err.code === 'TEAM_LOCKED') {
        setError('This team roster is locked.')
      } else if (err instanceof ApiError && err.code === 'NOT_REGISTERED') {
        setError('Register for the event first, then use this invite.')
      } else {
        setError('Could not join this team. Try again.')
      }
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={join}
        disabled={working}
        className="inline-flex h-10 items-center rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
      >
        {working ? 'Joining…' : `Join ${teamName}`}
      </button>
      {error && (
        <p role="alert" className="text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}
      <Link
        href={`/hackathons/${eventSlug}`}
        className="text-[12px] font-semibold text-muted-foreground hover:text-foreground"
      >
        Back to event
      </Link>
    </div>
  )
}
