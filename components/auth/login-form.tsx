'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { ApiError, apiLogin } from '@/lib/api-client'

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      await apiLogin(email, password)
      router.push('/')
      router.refresh()
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') {
        setError('Wrong email or password.')
      } else if (error instanceof ApiError && error.code === 'NETWORK_ERROR') {
        setError('Login failed. Is the server running?')
      } else {
        setError('Login failed. Try again.')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-95 rounded-xl border border-border bg-card p-8">
        <p className="text-[15px] font-bold tracking-[-0.02em] text-foreground">RaptorHack<span className="text-[#16a34a] dark:text-[#22c55e]">.</span></p>
        <h1 className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-foreground">Log in</h1>
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
              className="h-10 rounded-lg border border-border bg-background px-3 text-[13px] font-normal outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-foreground">
            Password
            <span className="relative flex">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 pr-10 text-[13px] font-normal outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
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
          {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] font-semibold text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="mt-1 inline-flex h-10 items-center justify-center rounded-lg bg-[#16a34a] text-[13px] font-bold text-white hover:bg-[#15803d] disabled:opacity-60"
          >
            {pending ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
          Seeded dev accounts use the password printed by the seed step. No account yet?{' '}
          <a href="/signup" className="font-semibold text-[#16a34a] dark:text-[#22c55e]">
            Sign up
          </a>
        </p>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          <a href="/" className="font-semibold text-[#16a34a] dark:text-[#22c55e]">
            Back to home
          </a>
        </p>
      </div>
    </main>
  )
}
