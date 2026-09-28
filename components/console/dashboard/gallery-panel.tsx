'use client'

import { useState } from 'react'
import { Check, Copy, Eye, EyeOff } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ApiError, apiSetSubmissionHidden, type DashboardGalleryItemPayload } from '@/lib/api-client'

// Gallery tab: every project for the event with a hide-from-gallery toggle,
// plus an embed snippet + live preview. The public gallery keeps filtering
// on isHidden, so hiding takes effect there immediately.
export function GalleryPanel({
  eventId,
  initialItems,
  eventStatus,
  publicBaseUrl,
}: {
  eventId: string
  initialItems: DashboardGalleryItemPayload[]
  // Effective status (already phase-derived by serializeEvent) — the embed
  // shows real projects only once this is PUBLISHED; earlier phases would
  // just render an empty, confusing-looking iframe (src/lib/gallery.ts's
  // isGalleryVisible gates on the same PUBLISHED check).
  eventStatus: string
  // Resolved server-side (PUBLIC_BASE_URL, falling back to the request's own
  // host) — never window.location.origin, which would point at whatever
  // port/proxy the admin happens to be browsing through.
  publicBaseUrl: string
}) {
  const [items, setItems] = useState(initialItems)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [copied, setCopied] = useState(false)

  const snippet = `<script src="${publicBaseUrl}/embed.js" data-event="${eventId}" data-theme="${theme}" async></script>`
  const isLive = eventStatus === 'PUBLISHED'

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

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

      <section aria-label="Embed" className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-[15px] font-bold text-foreground">Embed on your site</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Paste this snippet anywhere on an external page to show a live, read-only copy of this
          gallery.
        </p>

        <div className="mt-3 flex items-center gap-2">
          <label htmlFor={`embed-theme-${eventId}`} className="text-[12px] font-bold text-foreground">
            Theme
          </label>
          <select
            id={`embed-theme-${eventId}`}
            value={theme}
            onChange={(event) => setTheme(event.target.value as 'light' | 'dark')}
            className="h-9 rounded-lg border border-border bg-background px-3 text-[13px] font-semibold text-foreground outline-none focus:border-[#16a34a]"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <div className="mt-3 flex items-start gap-2">
          <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground">
            <code>{snippet}</code>
          </pre>
          <button
            type="button"
            onClick={copySnippet}
            aria-label="Copy embed snippet"
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-[12px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            {copied ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : <Copy size={14} strokeWidth={1.8} aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="mt-4">
          {isLive ? (
            <iframe
              src={`${publicBaseUrl}/embed/${eventId}?theme=${theme}`}
              title="Gallery embed preview"
              className="h-[420px] w-full rounded-lg border border-border"
            />
          ) : (
            <p className="rounded-lg border border-border bg-muted p-4 text-[12px] font-semibold text-muted-foreground">
              Your embed goes live once submissions close and results publish. The snippet above
              is ready to paste now — it will start showing projects automatically once that
              happens.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
