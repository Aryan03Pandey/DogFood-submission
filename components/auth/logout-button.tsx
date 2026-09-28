'use client'

import { useRouter } from 'next/navigation'
import { apiLogout } from '@/lib/api-client'

export default function LogoutButton() {
  const router = useRouter()

  async function logout() {
    await apiLogout().catch(() => null)
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={logout}
      className="rounded-lg border border-border px-3 py-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted"
    >
      Log out
    </button>
  )
}
