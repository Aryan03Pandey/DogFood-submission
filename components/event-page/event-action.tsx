'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calendar, Users } from 'lucide-react'

import { ApiError, apiRegisterForEvent } from '@/lib/api-client'
import type { EventActionState } from '@/src/lib/event-access'
import { cn } from '@/lib/utils'

// Action area above the event tabs. Renders one button from the resolved
// action state: Register POSTs and refreshes, linked states navigate onward,
// teamless users pick Create vs Join in a popup, and every other state is an
// honestly disabled button.
export function EventAction({
  eventId,
  slug,
  state,
  deadlineLabel,
  registrationCount,
}: {
  eventId: string
  slug: string
  state: EventActionState
  deadlineLabel: string | null
  registrationCount: number
}) {
  const router = useRouter()
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsProfile, setNeedsProfile] = useState(false)
  const [choiceOpen, setChoiceOpen] = useState(false)

  async function register() {
    if (working) return
    setWorking(true)
    setError(null)
    setNeedsProfile(false)
    try {
      await apiRegisterForEvent(eventId)
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_REGISTERED') {
        router.refresh()
      } else if (err instanceof ApiError && err.code === 'PROFILE_INCOMPLETE') {
        setError('Complete your profile before registering — first name, last name, and profession are required.')
        setNeedsProfile(true)
      } else if (err instanceof ApiError && err.code === 'EVENT_NOT_OPEN') {
        setError('Registration is closed for this event.')
      } else if (err instanceof ApiError && err.code === 'UNAUTHORIZED') {
        router.push('/login')
      } else {
        setError('Registration failed. Try again.')
      }
    } finally {
      setWorking(false)
    }
  }

  // Popup-first flow for TEAM events: the choice comes before registration.
  // Picking a card registers the viewer and continues to the team page;
  // closing the popup cancels without registering.
  async function choose(mode: 'create' | 'join') {
    if (working) return
    setWorking(true)
    setError(null)
    setNeedsProfile(false)
    try {
      await apiRegisterForEvent(eventId)
      router.push(`/hackathons/${slug}/team?mode=${mode}`)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_REGISTERED') {
        router.push(`/hackathons/${slug}/team?mode=${mode}`)
      } else if (err instanceof ApiError && err.code === 'PROFILE_INCOMPLETE') {
        setError('Complete your profile before registering — first name, last name, and profession are required.')
        setNeedsProfile(true)
      } else if (err instanceof ApiError && err.code === 'EVENT_NOT_OPEN') {
        setError('Registration is closed for this event.')
      } else if (err instanceof ApiError && err.code === 'UNAUTHORIZED') {
        router.push('/login')
      } else {
        setError('Registration failed. Try again.')
      }
    } finally {
      setWorking(false)
    }
  }

  const isRegister = state.buttonEnabled && state.buttonHref === null && !state.opensChoice
  const toneClass =
    state.tone === 'red'
      ? 'bg-destructive text-white hover:opacity-90'
      : 'bg-[#16a34a] text-white hover:bg-[#15803d]'

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      {state.headline && (
        <p className="text-[15px] font-bold text-foreground">{state.headline}</p>
      )}
      <div className={state.headline ? 'mt-3' : ''}>
        {isRegister ? (
          <button
            type="button"
            onClick={register}
            disabled={working}
            className="inline-flex h-10 items-center rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
          >
            {working ? 'Registering…' : 'Register'}
          </button>
        ) : state.buttonEnabled && state.opensChoice ? (
          <button
            type="button"
            onClick={() => setChoiceOpen(true)}
            className={cn(
              'inline-flex h-10 items-center rounded-lg px-5 text-[13px] font-bold transition-colors',
              toneClass,
            )}
          >
            {state.buttonLabel}
          </button>
        ) : state.buttonEnabled && state.buttonHref ? (
          <Link
            href={state.buttonHref}
            className={cn(
              'inline-flex h-10 items-center rounded-lg px-5 text-[13px] font-bold transition-colors',
              toneClass,
            )}
          >
            {state.buttonLabel}
          </Link>
        ) : (
          <button
            type="button"
            disabled
            title={state.headline ?? undefined}
            className="inline-flex h-10 cursor-not-allowed items-center rounded-lg bg-muted px-5 text-[13px] font-bold text-muted-foreground"
          >
            {state.buttonLabel}
          </button>
        )}
      </div>
      {(state.showDeadline || state.showCount) && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted-foreground">
          {state.showDeadline && deadlineLabel && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={13} strokeWidth={1.8} aria-hidden="true" />
              Registration closes {deadlineLabel}
            </span>
          )}
          {state.showCount && (
            <span className="inline-flex items-center gap-1.5">
              <Users size={13} strokeWidth={1.8} aria-hidden="true" />
              {registrationCount} registration{registrationCount === 1 ? '' : 's'} so far
            </span>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[12px] font-semibold text-destructive">
          {error}
          {needsProfile && (
            <>
              {' '}
              <Link href="/profile" className="font-bold text-[#16a34a] underline-offset-2 hover:underline dark:text-[#22c55e]">
                Complete your profile
              </Link>
            </>
          )}
        </p>
      )}
      {choiceOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create or join a team"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5"
          onClick={() => setChoiceOpen(false)}
        >
          <div
            className="grid w-full max-w-lg gap-3 rounded-xl border border-border bg-card p-6 sm:grid-cols-2"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              disabled={working}
              onClick={() => choose('create')}
              className="flex flex-col gap-1 rounded-xl border border-border p-5 text-left transition-colors hover:border-[#16a34a] disabled:opacity-60"
            >
              <span className="text-[15px] font-bold text-foreground">Create a Team</span>
              <span className="text-[12px] text-muted-foreground">
                Name your team and invite others with a code.
              </span>
            </button>
            <button
              type="button"
              disabled={working}
              onClick={() => choose('join')}
              className="flex flex-col gap-1 rounded-xl border border-border p-5 text-left transition-colors hover:border-[#16a34a] disabled:opacity-60"
            >
              <span className="text-[15px] font-bold text-foreground">Join a Team</span>
              <span className="text-[12px] text-muted-foreground">
                Have a code? Paste it to join a team.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setChoiceOpen(false)}
              className="text-[12px] font-semibold text-muted-foreground hover:text-foreground sm:col-span-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
