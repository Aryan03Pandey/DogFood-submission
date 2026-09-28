'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ApiError, apiSetSubmissionHidden, type DashboardGalleryItemPayload } from '@/lib/api-client'

// Gallery tab: every project for the event with a hide-from-gallery toggle.
// The public gallery keeps filtering on isHidden, so hiding takes effect
// there immediately.
export function GalleryPanel({
  eventId,
  initialItems,
}: {
  eventId: string
  initialItems: DashboardGalleryItemPayload[]
}) {
  const [items, setItems] = useState(initialItems)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(item: DashboardGalleryItemPayload) {
    if (pendingId) return
    setPendingId(item.id)
    setError(null)
    try {
      const updated = await apiSetSubmissionHidden(eventId, item.id, !item.isHidden)
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, isHidden: updated.isHidden } : row)))
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'FORBIDDEN' ? 'You cannot edit this event.' : 'Could not update visibility. Try again.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-border">
              {['Project', 'Team', 'Track', 'Visibility', 'Action'].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No projects yet.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold text-foreground">{item.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{item.teamName}</td>
                <td className="px-4 py-3 text-muted-foreground">{item.trackName}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'rounded-full px-2 py-1 text-[11px] font-bold',
                      item.isHidden
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-[#16a34a]/10 text-[#16a34a] dark:text-[#22c55e]',
                    )}
                  >
                    {item.isHidden ? 'Hidden' : 'Visible'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggle(item)}
                    disabled={pendingId === item.id}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-[12px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                  >
                    {item.isHidden ? (
                      <Eye size={14} strokeWidth={1.8} aria-hidden="true" />
                    ) : (
                      <EyeOff size={14} strokeWidth={1.8} aria-hidden="true" />
                    )}
                    {pendingId === item.id ? 'Saving…' : item.isHidden ? 'Unhide' : 'Hide'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
