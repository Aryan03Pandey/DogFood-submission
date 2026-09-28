'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, User } from 'lucide-react'

import { ApiError, apiUnregisterForEvent } from '@/lib/api-client'

// Solo view for INDIVIDUAL events: registration confirmation, the member
// list (just you), and password-confirmed Cancel Registration.
export function IndividualView({
  eventId,
  slug,
  name,
  email,
}: {
  eventId: string
  slug: string
  name: string | null
  email: string
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cancel() {
    if (password === '' || working) return
    setWorking(true)
    setError(null)
    try {
      await apiUnregisterForEvent(eventId, password)
      router.push(`/hackathons/${slug}`)
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        setError('Wrong password. Try again.')
      } else {
        setError('Could not cancel registration. Try again.')
      }
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}
      <section aria-label="Registration" className="rounded-xl border border-border bg-card p-6">
        <p className="text-[15px] font-bold text-[#16a34a] dark:text-[#22c55e]">
          Registration Successful
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          You are registered for this event as an individual.
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          <li className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
            >
              <User size={15} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold text-foreground">
                {name ?? email}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {email} · Me
              </span>
            </span>
          </li>
        </ul>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-destructive/40 px-5 text-[13px] font-bold text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" /> Cancel Registration
          </button>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              cancel()
            }}
            className="mt-4 flex max-w-sm flex-col gap-2"
          >
            <p className="text-[12px] font-semibold text-destructive">
              Warning: this removes your registration. It cannot be undone.
            </p>
            <label htmlFor={`cancel-reg-${eventId}`} className="text-[12px] font-bold text-foreground">
              Confirm with your password
            </label>
            <div className="flex gap-2">
              <input
                id={`cancel-reg-${eventId}`}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Your password"
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-destructive"
              />
              <button
                type="submit"
                disabled={working || password === ''}
                className="inline-flex h-10 shrink-0 items-center rounded-lg bg-destructive px-5 text-[13px] font-bold text-white transition-colors hover:opacity-90 disabled:opacity-60"
              >
                {working ? 'Canceling…' : 'Confirm cancel'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
