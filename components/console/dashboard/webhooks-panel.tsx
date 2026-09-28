'use client'

import { useState } from 'react'
import { Send, Trash2, Webhook } from 'lucide-react'

import {
  ApiError,
  apiListWebhooks,
  apiRegisterWebhook,
  apiRevokeWebhook,
  apiTestWebhook,
  type WebhookEndpointPayload,
} from '@/lib/api-client'

function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'UNSAFE_WEBHOOK_URL') return "That URL resolves to an address this app won't call (private, loopback, or an internal service)."
    if (error.code === 'INVALID_WEBHOOK_URL') return 'Enter a valid http:// or https:// URL.'
    if (error.code === 'FORBIDDEN') return 'Only organizers can manage webhooks.'
    if (error.code === 'WEBHOOK_NOT_FOUND') return 'That webhook is already gone.'
    if (error.code === 'NETWORK_ERROR') return 'Request failed. Is the server running?'
  }
  return 'Request failed. Try again.'
}

// Tier 4.5. Registering shows the HMAC secret exactly once (same shape as
// an API token's raw value in /settings) — it never comes back from a
// later list call, so this keeps it in local state until the panel is
// dismissed or another action re-renders the list.
export function WebhooksPanel({
  eventId,
  initialWebhooks,
}: {
  eventId: string
  initialWebhooks: WebhookEndpointPayload[]
}) {
  const [webhooks, setWebhooks] = useState(initialWebhooks)
  const [url, setUrl] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [revealedSecret, setRevealedSecret] = useState<{ webhookId: string; secret: string } | null>(null)

  async function refresh() {
    const { webhooks } = await apiListWebhooks(eventId)
    setWebhooks(webhooks)
  }

  async function register() {
    if (url.trim() === '' || working) return
    setWorking(true)
    setError(null)
    try {
      const { webhook } = await apiRegisterWebhook(eventId, url.trim())
      setUrl('')
      setRevealedSecret({ webhookId: webhook.id, secret: webhook.secret })
      setNotice('Webhook registered. Copy the secret now — it will not be shown again.')
      await refresh()
    } catch (err) {
      setError(message(err))
    } finally {
      setWorking(false)
    }
  }

  async function revoke(webhookId: string) {
    setWorking(true)
    setError(null)
    try {
      await apiRevokeWebhook(eventId, webhookId)
      if (revealedSecret?.webhookId === webhookId) setRevealedSecret(null)
      setNotice('Webhook revoked.')
      await refresh()
    } catch (err) {
      setError(message(err))
    } finally {
      setWorking(false)
    }
  }

  async function sendTest(webhookId: string) {
    setWorking(true)
    setError(null)
    try {
      await apiTestWebhook(eventId, webhookId)
      setNotice('Test delivery queued — the worker sends it on its next poll.')
    } catch (err) {
      setError(message(err))
    } finally {
      setWorking(false)
    }
  }

  return (
    <section aria-label="Webhooks" className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-[15px] font-bold text-foreground">Webhooks</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Get an HMAC-signed HTTP POST when this event's submissions are created, judging completes,
        or results publish. Only URLs that resolve to a public address are accepted.
      </p>

      {notice && (
        <p role="status" className="mt-3 rounded-xl border border-[#16a34a]/30 bg-[#16a34a]/10 p-3 text-[12px] font-semibold text-[#16a34a] dark:text-[#22c55e]">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}
      {revealedSecret && (
        <div className="mt-3 rounded-xl border border-border bg-background p-3">
          <p className="text-[12px] font-semibold text-foreground">Secret (shown once):</p>
          <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-[12px]">{revealedSecret.secret}</code>
        </div>
      )}

      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void register()
        }}
      >
        <label htmlFor="webhook-url" className="sr-only">
          Webhook URL
        </label>
        <input
          id="webhook-url"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://your-server.example.com/hooks/dogfood"
          className="h-10 min-w-72 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
        />
        <button
          type="submit"
          disabled={working || url.trim() === ''}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#16a34a] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
        >
          <Webhook size={15} strokeWidth={1.8} aria-hidden="true" /> Register
        </button>
      </form>

      <h4 className="mt-5 text-[13px] font-bold text-foreground">Registered endpoints ({webhooks.length})</h4>
      {webhooks.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">No webhooks registered yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {webhooks.map((webhook) => (
            <li key={webhook.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-foreground">{webhook.url}</span>
              <button
                type="button"
                onClick={() => void sendTest(webhook.id)}
                disabled={working}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                <Send size={14} strokeWidth={1.8} aria-hidden="true" /> Send test
              </button>
              <button
                type="button"
                onClick={() => void revoke(webhook.id)}
                disabled={working}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-[12px] font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
              >
                <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
