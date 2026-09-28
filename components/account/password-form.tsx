'use client'

import { useState } from 'react'

import { ApiError, apiChangePassword, validationDetailsMessage } from '@/lib/api-client'
import { PASSWORD_RULES } from '@/lib/password-rules'

// Account Settings > Security: current + new + confirm, same rule checklist
// as signup so client and server agree on what a valid password is.
export function PasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [working, setWorking] = useState(false)

  const unmetIds = new Set(
    PASSWORD_RULES.filter((rule) => !rule.test(next)).map((rule) => rule.id),
  )
  const mismatch = confirm.length > 0 && confirm !== next
  const canSubmit =
    current.length > 0 && unmetIds.size === 0 && confirm.length > 0 && !mismatch && !working

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setWorking(true)
    setError(null)
    setDone(false)
    try {
      await apiChangePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        setError('That current password is not right.')
      } else if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        setError(validationDetailsMessage(err) ?? 'The new password does not meet the rules below.')
      } else {
        setError('Could not change the password. Try again.')
      }
    } finally {
      setWorking(false)
    }
  }

  const inputClass =
    'h-10 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]'

  return (
    <form onSubmit={onSubmit} className="mt-4 flex max-w-md flex-col gap-3">
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
        Current password
        <input
          type="password"
          required
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
        New password
        <input
          type="password"
          required
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          className={inputClass}
        />
      </label>
      <ul className="flex flex-col gap-1" aria-label="Password requirements">
        {PASSWORD_RULES.map((rule) => {
          const met = !unmetIds.has(rule.id)
          return (
            <li
              key={rule.id}
              className={`text-[11px] font-semibold ${met ? 'text-[#16a34a] dark:text-[#22c55e]' : 'text-muted-foreground'}`}
            >
              {met ? '✓' : '○'} {rule.label}
            </li>
          )
        })}
      </ul>
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
        Confirm new password
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className={inputClass}
        />
      </label>
      {mismatch && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] font-semibold text-destructive">
          Passwords don&apos;t match yet.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="rounded-lg border border-[#16a34a]/30 bg-[#16a34a]/10 px-3 py-2 text-[12px] font-semibold text-[#16a34a] dark:text-[#22c55e]">
          Password changed.
        </p>
      )}
      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex h-10 items-center justify-center rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
      >
        {working ? 'Changing…' : 'Change password'}
      </button>
    </form>
  )
}
