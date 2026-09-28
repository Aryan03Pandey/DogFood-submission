'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Compass,
  FolderKanban,
  Gavel,
  LayoutDashboard,
  LogOut,
  Pencil,
  Settings,
  User,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { apiLogout } from '@/lib/api-client'
import { visibleMenuGroups } from '@/src/lib/user-menu'

// Account dropdown opened from the navbar avatar. Structure mirrors the
// approved mock: identity header, grouped icon rows, hairline dividers.
// Token surfaces only so it follows the global light/dark theme.
// Destinations: Organizer Dashboard and Log Out are live; profile,
// hackathon, project, and settings pages do not exist yet, so those rows
// point at their planned paths and will 404 until the pages are built.
const ICONS: Record<string, typeof Pencil> = {
  'Edit Profile': Pencil,
  'My Hackathons': Compass,
  'My Projects': FolderKanban,
  'Judge Dashboard': Gavel,
  'Organizer Dashboard': LayoutDashboard,
  'Account Settings': Settings,
}

export default function UserMenu({
  name,
  email,
  role,
  managesEvents = false,
  judgesEvents = false,
}: {
  name: string | null
  email: string
  role?: string
  // Management entry points stay hidden unless the session organizes at
  // least one event (or is SUPERADMIN); the Judge Dashboard row needs a
  // judge mapping on at least one event; the personal rows (My Hackathons,
  // My Projects) stay hidden from SUPERADMINs. The APIs enforce all of
  // this too; this only keeps the menu honest.
  managesEvents?: boolean
  judgesEvents?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const visibleGroups = visibleMenuGroups(role, managesEvents, judgesEvents)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open ])

  async function logout() {
    setOpen(false)
    await apiLogout().catch(() => null)
    router.push('/login')
    router.refresh()
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={cn(
          'flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          open && 'bg-muted text-foreground',
        )}
      >
        <User size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg"
        >
          <div className="px-3 py-2">
            {name && (
              <p className="truncate text-[14px] font-bold text-foreground">{name}</p>
            )}
            <p className="truncate text-[12px] text-muted-foreground">{email}</p>
          </div>

          {visibleGroups.map((group, index) => (
            <div key={group.map((item) => item.label).join('|')}>
              {index > 0 && <div className="mx-3 my-1 border-t border-border" role="separator" />}
              {group.map((item) => {
                const Icon = ICONS[item.label] ?? User
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-popover-foreground transition-colors hover:bg-muted"
                  >
                    <Icon size={16} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-muted-foreground" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}

          <div className="mx-3 my-1 border-t border-border" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-popover-foreground transition-colors hover:bg-muted"
          >
            <LogOut size={16} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-muted-foreground" />
            Log Out
          </button>
        </div>
      )}
    </div>
  )
}
