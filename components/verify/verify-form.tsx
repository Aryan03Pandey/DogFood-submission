'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Upload, XCircle } from 'lucide-react'

import { apiVerifyEnvelope, type VerifyResult } from '@/lib/api-client'

// Maps every reason code src/server/signing-service.ts's verifyEnvelope can
// actually return (confirmed by reading that file directly) — not a guessed
// subset.
const REASON_MESSAGES: Record<string, string> = {
  NOT_AN_OBJECT: "That doesn't look like a signed file.",
  UNKNOWN_FORMAT: 'Not a recognized signed-envelope format.',
  UNKNOWN_VERSION: 'This envelope version is not supported.',
  MALFORMED_ENVELOPE: "The file is missing fields a signed envelope needs.",
  UNKNOWN_KID: "Signed by a key this instance doesn't recognize.",
  MALFORMED_PAYLOAD: 'The payload could not be read.',
  BAD_SIGNATURE: "Signature doesn't match — the file may have been altered.",
}

export function VerifyForm() {
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [result, setResult] = useState<VerifyResult | null>(null)

  async function onFileChange(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    setText(await file.text())
    setResult(null)
    setParseError(null)
  }

  async function onVerify() {
    if (pending) return
    setParseError(null)
    setResult(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      setParseError("That isn't valid JSON.")
      return
    }
    setPending(true)
    try {
      setResult(await apiVerifyEnvelope(parsed))
    } catch {
      setParseError('Could not reach the verifier. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="verify-textarea" className="text-[12px] font-bold text-foreground">
          Paste the file&apos;s JSON
        </label>
        <textarea
          id="verify-textarea"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setResult(null)
            setParseError(null)
          }}
          rows={10}
          placeholder='{"format":"dogfood-signed", ...}'
          className="mt-2 w-full rounded-lg border border-border bg-background p-3 font-mono text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
        />
      </div>

      <label className="inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted">
        <Upload size={15} strokeWidth={1.8} aria-hidden="true" />
        Or upload a file
        <input type="file" accept="application/json" onChange={(event) => onFileChange(event.target.files)} className="hidden" />
      </label>

      {parseError && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-[12px] font-semibold text-destructive">
          {parseError}
        </p>
      )}

      {result &&
        (result.valid ? (
          <p role="status" className="flex items-center gap-2 rounded-xl border border-[#16a34a]/30 bg-[#16a34a]/10 p-4 text-[13px] font-semibold text-[#16a34a] dark:text-[#22c55e]">
            <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
            Valid — signed by key <code className="font-mono">{result.kid}</code>.
          </p>
        ) : (
          <p role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-[13px] font-semibold text-destructive">
            <XCircle size={16} strokeWidth={2} aria-hidden="true" />
            {(result.reason && REASON_MESSAGES[result.reason]) ?? "This isn't a valid signed file."}
          </p>
        ))}

      <button
        type="button"
        onClick={onVerify}
        disabled={pending || text.trim() === ''}
        className="inline-flex h-10 w-fit items-center gap-2 rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
      >
        {pending ? 'Verifying…' : 'Verify'}
      </button>

      <p className="text-[12px] text-muted-foreground">
        <Link href="/api/keys" className="font-semibold text-foreground underline">
          View public keys
        </Link>{' '}
        this instance signs with.
      </p>
    </div>
  )
}
