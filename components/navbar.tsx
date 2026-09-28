'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { isActiveNavItem } from '@/src/lib/nav'
import ThemeToggle from '@/components/theme-toggle'
import UserMenu from '@/components/user-menu'

// Shared navbar for Home, Hackathons, and Projects. Techy showcase chrome:
// tinted glass bar (ice wash in light, midnight in dark) with a cyan→violet
// hairline, gradient brand tile, and pill nav links. Signed-in users get an
// avatar opening the account dropdown; the identity never renders as text.
// Event creation stays privileged-only (SUPERADMIN or a managing organizer).
const links = [
  { label: 'Home', href: '/' },
  { label: 'Hackathons', href: '/hackathons' },
  { label: 'Projects', href: '/projects' },
]

export default function Navbar({
  user,
  managesEvents = false,
  judgesEvents = false,
}: {
  user?: { name: string | null; email: string; role: string } | null
  managesEvents?: boolean
  judgesEvents?: boolean
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  // Event creation is privileged-only (SUPERADMIN or an organizer who
  // already manages an event): participants and signed-out visitors never
  // see a button for an action the API would refuse.
  const showHost = Boolean(user && (user.role === 'SUPERADMIN' || managesEvents))

  return (
    <header className="sticky top-0 z-50 border-b border-slate-900/10 bg-[#eef4fb]/85 backdrop-blur-md dark:border-white/10 dark:bg-[#070b24]/85">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2" aria-label="RaptorHack home">
            <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#2f7bff] to-fuchsia-500 text-[15px] font-bold text-white shadow-[0_0_14px_rgba(47,123,255,0.5)]">
              R
            </span>
            <span className="text-[17px] font-bold tracking-[-0.02em] text-foreground">
              RaptorHack<span className="text-[#16a34a] dark:text-[#22c55e]">.</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {links.map((link) => {
              const active = isActiveNavItem(link.href, pathname)
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-[14px] font-medium transition-colors',
                    active
                      ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-200'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="hidden items-center gap-4 md:flex">
          <ThemeToggle />
          {user ? (
            <UserMenu name={user.name} email={user.email} role={user.role} managesEvents={managesEvents} judgesEvents={judgesEvents} />
          ) : (
            <Link
              href="/login"
              className="text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Log In
            </Link>
          )}
          {showHost && (
            <Link
              href="/console/events/new"
              className="inline-flex h-9 items-center rounded-lg bg-[#16a34a] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d]"
            >
              Host an Event
            </Link>
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          {user && (
            <UserMenu name={user.name} email={user.email} role={user.role} managesEvents={managesEvents} judgesEvents={judgesEvents} />
          )}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            {open ? <X size={20} strokeWidth={1.8} /> : <Menu size={20} strokeWidth={1.8} />}
          </button>
        </div>
      </div>

      {/* Cyan→violet hairline tying the bar to the hero. */}
      <div
        className="h-px bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent dark:via-cyan-400/50"
        aria-hidden="true"
      />

      <div className={cn('border-t border-slate-900/10 bg-[#eef4fb] md:hidden dark:border-white/10 dark:bg-[#0a1030]', open ? 'block' : 'hidden')}>
        <nav className="mx-auto flex max-w-5xl flex-col gap-1 px-5 py-3" aria-label="Mobile">
          {links.map((link) => {
            const active = isActiveNavItem(link.href, pathname)
            return (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-3 py-2 text-[14px] font-medium hover:bg-muted',
                  active ? 'text-cyan-700 dark:text-cyan-200' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            )
          })}
          {(!user || showHost) && (
            <div className="mt-2 flex items-center gap-2 border-t border-slate-900/10 pt-3 pb-1 dark:border-white/10">
              {!user && (
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-border text-[13px] font-bold text-foreground"
                >
                  Log In
                </Link>
              )}
              {showHost && (
                <Link
                  href="/console/events/new"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-[#16a34a] text-[13px] font-bold text-white hover:bg-[#15803d]"
                >
                  Host an Event
                </Link>
              )}
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}
