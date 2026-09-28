import Link from 'next/link'
import { Bell, User } from 'lucide-react'

import ThemeToggle from '@/components/theme-toggle'

// Site header shown on every page except the home page (which uses
// components/navbar.tsx). Matches the product mock: logo + Home nav on the
// left, theme toggle + notification bell + user chip on the right. Theme
// tokens throughout so the global light/dark toggle applies; brand accent
// is green.
export default function SiteHeader({ username }: { username?: string | null }) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2" aria-label="dogfood home">
            <span className="flex size-7 items-center justify-center rounded-lg bg-[#16a34a] text-[15px] font-bold text-white">
              d
            </span>
            <span className="text-[17px] font-bold tracking-[-0.02em] text-foreground">dogfood</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/"
              className="text-[14px] font-medium text-muted-foreground transition-colors hover:text-[#16a34a] dark:hover:text-[#22c55e]"
            >
              Home
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link
            href="/console"
            aria-label="Notifications"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-[#16a34a] dark:hover:text-[#22c55e]"
          >
            <Bell size={20} strokeWidth={1.8} />
          </Link>
          {username ? (
            <span className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                <User size={18} strokeWidth={1.8} />
              </span>
              <span className="text-[14px] font-semibold text-foreground">{username}</span>
            </span>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-[#16a34a] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#15803d]"
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
