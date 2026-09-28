'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Megaphone } from 'lucide-react'

import { ApiError, apiPublishEvent } from '@/lib/api-client'

// Go-live button with password confirmation, shared by the preview page and
// Event Settings. Going live moves a DRAFT to REGISTRATION (onto the live
// list) and needs the actor's password plus a complete core schedule.
export function GoLiveControl({ eventId, isDraft }: { eventId: string; isDraft: boolean }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isDraft) return null

  async function goLive() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    if (password === '' || working) return
    setWorking(true)
    setError(null)
    try {
      await apiPublishEvent(eventId, password)
      setConfirming(false)
      setPassword('')
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        setError('Wrong password. Try again.')
      } else if (err instanceof ApiError && err.code === 'ALREADY_LIVE') {
        setConfirming(false)
        setPassword('')
        router.refresh()
      } else if (err instanceof ApiError && err.code === 'SCHEDULE_INCOMPLETE') {
        setError('Complete the timeline before going live: registration end, submission end, and judging end are required.')
      } else {
        setError('Go-live failed. Try again.')
      }
    } finally {
      setWorking(false)
    }
  }

  function cancel() {
    setConfirming(false)
    setPassword('')
    setError(null)
  }

  return (
    <div>
      {!confirming ? (
        <button
          type="button"
          onClick={goLive}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d]"
        >
          <Megaphone size={15} strokeWidth={1.8} aria-hidden="true" />
          Go live
        </button>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            goLive()
          }}
          className="flex max-w-sm flex-col gap-2"
        >
          <label htmlFor={`golive-password-${eventId}`} className="text-[12px] font-bold text-foreground">
            Confirm with your password
          </label>
          <div className="flex gap-2">
            <input
              id={`golive-password-${eventId}`}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Your password"
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
            />
            <button
              type="submit"
              disabled={working || password === ''}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
            >
              {working ? 'Going live…' : 'Confirm go live'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={working}
              className="inline-flex h-10 shrink-0 items-center rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
          {error && (
            <p role="alert" className="text-[12px] font-semibold text-destructive">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  )
}
