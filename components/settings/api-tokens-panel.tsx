'use client'

import { useState } from 'react'
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react'

import { ApiError, apiCreateToken, apiRevokeToken, type ApiTokenPayload } from '@/lib/api-client'

interface IssuedToken {
  id: string
  name: string
  token: string
  createdAt: string
}

export function ApiTokensPanel({ initialTokens }: { initialTokens: ApiTokenPayload[] }) {
  const [tokens, setTokens] = useState(initialTokens)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [justCreated, setJustCreated] = useState<IssuedToken | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Revoking is not reversible — whatever script used that token breaks —
  // so this is a real two-click arm/confirm, same as removeEvent in
  // settings-panel.tsx, not the single-click removeMember pattern.
  const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  async function createToken() {
    const trimmed = name.trim()
    if (trimmed === '' || creating) return
    setCreating(true)
    setError(null)
    try {
      const issued = await apiCreateToken(trimmed)
      setJustCreated(issued)
      setTokens((prev) => [
        { id: issued.id, name: issued.name, tokenPrefix: issued.token.slice(0, 12), createdAt: issued.createdAt, lastUsedAt: null, revokedAt: null },
        ...prev,
      ])
      setName('')
    } catch {
      setError('Could not create a token. Try again.')
    } finally {
      setCreating(false)
    }
  }

  async function revoke(tokenId: string) {
    if (confirmingRevokeId !== tokenId) {
      setConfirmingRevokeId(tokenId)
      return
    }
    if (revokingId) return
    setRevokingId(tokenId)
    setError(null)
    try {
      await apiRevokeToken(tokenId)
      setTokens((prev) => prev.map((t) => (t.id === tokenId ? { ...t, revokedAt: new Date().toISOString() } : t)))
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'TOKEN_NOT_FOUND' ? 'That token is already gone.' : 'Could not revoke that token. Try again.')
    } finally {
      setRevokingId(null)
      setConfirmingRevokeId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}

      {justCreated && (
        <div role="status" className="rounded-xl border border-[#16a34a]/30 bg-[#16a34a]/10 p-4">
          <p className="text-[12px] font-bold text-[#16a34a] dark:text-[#22c55e]">
            Token created — copy it now. It won&apos;t be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground">
              {justCreated.token}
            </code>
            <button
              type="button"
              onClick={() => copy(justCreated.token)}
              aria-label="Copy token"
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-[12px] font-bold text-foreground transition-colors hover:bg-muted"
            >
              {copied ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : <Copy size={14} strokeWidth={1.8} aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Token name (e.g. ci-script)"
          aria-label="Token name"
          className="h-10 min-w-52 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
        />
        <button
          type="button"
          onClick={createToken}
          disabled={creating || name.trim() === ''}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
        >
          <KeyRound size={15} strokeWidth={1.8} aria-hidden="true" />
          {creating ? 'Creating…' : 'Create token'}
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {tokens.length === 0 && <li className="text-[13px] text-muted-foreground">No tokens yet.</li>}
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold text-foreground">{t.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {t.tokenPrefix}… · created {new Date(t.createdAt).toLocaleDateString()}
                {t.lastUsedAt && ` · last used ${new Date(t.lastUsedAt).toLocaleDateString()}`}
                {t.revokedAt && ' · revoked'}
              </span>
            </span>
            {!t.revokedAt &&
              (confirmingRevokeId === t.id ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => revoke(t.id)}
                    disabled={revokingId === t.id}
                    className="inline-flex h-9 items-center gap-1 rounded-lg bg-destructive px-3 text-[12px] font-bold text-white transition-colors hover:opacity-90 disabled:opacity-60"
                  >
                    <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
                    {revokingId === t.id ? 'Revoking…' : 'Confirm revoke'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRevokeId(null)}
                    disabled={revokingId === t.id}
                    className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-[12px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => revoke(t.id)}
                  aria-label={`Revoke ${t.name}`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                >
                  <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
                </button>
              ))}
          </li>
        ))}
      </ul>
    </div>
  )
}
