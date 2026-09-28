'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { ApiError, apiRegister, validationDetailsMessage } from '@/lib/api-client'
import {
  PASSWORD_RULES,
  evaluatePasswordStrength,
  type PasswordStrength,
} from '@/lib/password-rules'

const STRENGTH_STYLES: Record<PasswordStrength, { bar: string; label: string }> = {
  Weak: { bar: 'bg-[#c04545]', label: 'text-[#c04545]' },
  Medium: { bar: 'bg-[#d9930d]', label: 'text-[#9a6b0a]' },
  Strong: { bar: 'bg-[#2f9e5f]', label: 'text-[#16a34a] dark:text-[#22c55e]' },
}

export default function SignupForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const strength = evaluatePasswordStrength(password)
  const strengthStyle = STRENGTH_STYLES[strength]
  const unmetIds = new Set(
    PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.id),
  )
  const mismatch = confirmPassword.length > 0 && confirmPassword !== password
  const canSubmit =
    email.trim().length > 0 && unmetIds.size === 0 && confirmPassword.length > 0 && !mismatch

  function clearAll() {
    setEmail('')
    setPassword('')
    setConfirmPassword('')
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit || pending) return
    setError(null)
    setPending(true)
    try {
      await apiRegister(email.trim(), password)
      router.push('/')
      router.refresh()
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_TAKEN') {
        clearAll()
        setError('An account with this email already exists. Enter the details again.')
      } else if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        setError(validationDetailsMessage(error) ?? 'Some details look wrong. Check the form and try again.')
      } else if (error instanceof ApiError && error.code === 'NETWORK_ERROR') {
        setError('Sign up failed. Is the server running?')
      } else {
        setError('Sign up failed. Try again.')
      }
    } finally {
      setPending(false)
    }
  }

  const inputClass =
    'h-10 rounded-lg border border-border bg-background px-3 text-[13px] font-normal outline-none placeholder:text-muted-foreground focus:border-[#16a34a]'

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-95 rounded-xl border border-border bg-card p-8">
        <p className="text-[15px] font-bold tracking-[-0.02em] text-foreground">RaptorHack<span className="text-[#16a34a] dark:text-[#22c55e]">.</span></p>
        <h1 className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-foreground">Sign up</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">Offline-first hackathon console.</p>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="organizer@local"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
            Password
            <span className="relative flex">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                aria-describedby="password-strength"
                className={`${inputClass} w-full pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#b5b7bf] transition-colors hover:bg-[#f1f2f5] hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff size={16} strokeWidth={1.8} aria-hidden="true" />
                ) : (
                  <Eye size={16} strokeWidth={1.8} aria-hidden="true" />
                )}
              </button>
            </span>
          </label>
          {password.length > 0 && (
            <div id="password-strength" className="flex items-center gap-2" aria-live="polite">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={`block h-full rounded-full transition-all ${strengthStyle.bar} ${
                    strength === 'Weak' ? 'w-1/3' : strength === 'Medium' ? 'w-2/3' : 'w-full'
                  }`}
                />
              </span>
              <span className={`text-[11px] font-bold ${strengthStyle.label}`}>{strength}</span>
            </div>
          )}
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
            Confirm password
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="••••••••"
              className={inputClass}
            />
          </label>
          {mismatch && (
            <p className="rounded-lg bg-[#fdf6e8] px-3 py-2 text-[12px] font-semibold text-[#9a6b0a]">
              Passwords don&apos;t match yet.
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] font-semibold text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending || !canSubmit}
            title={!canSubmit ? 'Fill every field, meet all password rules, and match both passwords.' : undefined}
            className="mt-1 inline-flex h-10 items-center justify-center rounded-lg bg-[#16a34a] text-[13px] font-bold text-white hover:bg-[#15803d] disabled:opacity-60"
          >
            {pending ? 'Signing up…' : 'Sign up'}
          </button>
        </form>
        <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
          Already have an account?{' '}
          <a href="/login" className="font-semibold text-[#16a34a] dark:text-[#22c55e]">
            Log in
          </a>
        </p>
      </div>
    </main>
  )
}
