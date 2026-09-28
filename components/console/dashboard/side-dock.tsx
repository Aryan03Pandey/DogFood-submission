'use client'

import Link from 'next/link'

import { cn } from '@/lib/utils'
import { DASHBOARD_TABS, type DashboardTabId } from '@/components/console/dashboard/tabs'

export function tabHref(eventId: string | null, tab: DashboardTabId): string {
  return eventId ? `/console?eventId=${eventId}&tab=${tab}` : `/console?tab=${tab}`
}

const WORKSPACE_TABS = DASHBOARD_TABS.filter((tab) => tab.id !== 'settings')

// Left dock: fixed (non-collapsible) icon + label navigation. Sticky beside
// the content column with its own scroll, so it never scrolls away with the
// page.
export function SideDock({
  eventId,
  activeTab,
  user,
  counts,
}: {
  eventId: string | null
  activeTab: DashboardTabId
  user: { name: string | null; email: string; role: string } | null
  counts?: Partial<Record<'participants' | 'submissions' | 'judging', number>>
}) {
  const initials = (user?.name ?? user?.email ?? '?')
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <aside
      aria-label="Dashboard"
      className="sticky top-[calc(4rem+60px)] hidden h-[calc(100vh-4rem-60px)] min-h-[calc(100vh-4rem-60px)] w-[256px] shrink-0 flex-col border-r border-border bg-card lg:flex"
    >
      <div className="flex h-[78px] shrink-0 items-center gap-3 border-b border-border px-7">
        <div className="flex size-9 items-center justify-center rounded-lg bg-[#16a34a] text-[15px] font-bold text-white">
          R
        </div>
        <div>
          <p className="text-[15px] font-bold tracking-[-0.02em] text-foreground">dogfood</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Admin console
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6">
        <p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Workspace
        </p>
        <nav aria-label="Dashboard tabs" className="flex flex-col gap-1">
          {WORKSPACE_TABS.map((tab) => {
            const active = tab.id === activeTab
            const count =
              tab.id === 'submissions'
                ? counts?.submissions
                : tab.id === 'participants'
                  ? counts?.participants
                  : tab.id === 'judging'
                    ? counts?.judging
                    : undefined
            return (
              <Link
                key={tab.id}
                href={tabHref(eventId, tab.id)}
                aria-current={active ? 'page' : undefined}
                aria-label={tab.label}
                className={cn(
                  'flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[13px] font-semibold transition-colors',
                  active
                    ? 'bg-[#16a34a]/10 text-[#16a34a] dark:text-[#22c55e]'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <tab.icon size={17} strokeWidth={active ? 2.3 : 1.8} aria-hidden="true" />
                <span className="flex-1">{tab.label}</span>
                {count !== undefined && (
                  <span
                    className={cn(
                      'rounded-md bg-muted px-2 py-0.5 text-[10px]',
                      active ? 'text-[#16a34a] dark:text-[#22c55e]' : 'text-muted-foreground',
                    )}
                  >
                    {count}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <p className="px-3 pb-3 pt-9 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Manage
        </p>
        <nav aria-label="Manage" className="flex flex-col gap-1">
          <Link
            href={tabHref(eventId, 'settings')}
            aria-current={activeTab === 'settings' ? 'page' : undefined}
            aria-label="Event Settings"
            className={cn(
              'flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[13px] font-semibold transition-colors',
              activeTab === 'settings'
                ? 'bg-[#16a34a]/10 text-[#16a34a] dark:text-[#22c55e]'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {(() => {
              const Icon = DASHBOARD_TABS.find((tab) => tab.id === 'settings')!.icon
              return <Icon size={17} strokeWidth={activeTab === 'settings' ? 2.3 : 1.8} aria-hidden="true" />
            })()}
            <span className="flex-1">Event settings</span>
          </Link>
        </nav>
      </div>

      {user && (
        <div className="flex shrink-0 items-center gap-3 border-t border-border p-5">
          <div
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-full bg-[#16a34a]/10 text-[11px] font-bold text-[#16a34a] dark:text-[#22c55e]"
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold text-foreground">{user.name ?? user.email}</p>
            <p className="text-[10px] capitalize text-muted-foreground">{user.role.toLowerCase()}</p>
          </div>
        </div>
      )}
    </aside>
  )
}
