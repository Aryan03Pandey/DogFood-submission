'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError, apiImpersonate } from '@/lib/api-client'

const SEEDED_ACCOUNTS = [
  { email: 'admin@local', label: 'Superadmin' },
  { email: 'organizer@local', label: 'Organizer' },
  { email: 'judge1@local', label: 'Judge' },
  { email: 'participant@local', label: 'Participant' },
]

export default function ImpersonationSwitcher({ currentEmail }: { currentEmail: string | null }) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function impersonate(email: string) {
    setPending(email)
    setError(null)
    try {
      await apiImpersonate(email)
      router.refresh()
    } catch (error) {
      setError(
        error instanceof ApiError && error.code === 'USER_NOT_FOUND'
          ? 'Switch failed. Is the seed data loaded?'
          : 'Switch failed. Is the server running?',
      )
    } finally {
      setPending(null)
    }
  }

  return (
    <section className="rounded-xl border border-dashed border-[#c9cbe8] bg-[#f4f3ff] p-5">
      <p className="text-[12px] font-bold text-[#464956]">
        Dev impersonation <span className="ml-1 rounded bg-[#e4e1ff] px-1.5 py-0.5 text-[10px] text-[#635bdb]">OFFLINE_MODE</span>
      </p>
      <p className="mt-1 text-[11px] text-[#777a86]">One-click switch between seeded contexts. No password needed. Dev builds only.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SEEDED_ACCOUNTS.map((account) => {
          const active = currentEmail === account.email
          return (
            <button
              key={account.email}
              disabled={pending !== null || active}
              onClick={() => impersonate(account.email)}
              className={`rounded-lg border px-3 py-2 text-[12px] font-semibold disabled:opacity-60 ${
                active
                  ? 'border-[#635bdb] bg-[#635bdb] text-white'
                  : 'border-[#dfe0f2] bg-white text-[#464956] hover:border-[#aaa5ee]'
              }`}
            >
              {pending === account.email ? 'Switching…' : account.label}
            </button>
          )
        })}
      </div>
      {error && <p className="mt-2 text-[12px] font-semibold text-[#c04545]">{error}</p>}
    </section>
  )
}
