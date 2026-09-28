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
      className="rounded-lg border border-[#e5e6eb] px-3 py-2 text-[12px] font-semibold text-[#686b77] hover:bg-[#f5f5f8]"
    >
      Log out
    </button>
  )
}
