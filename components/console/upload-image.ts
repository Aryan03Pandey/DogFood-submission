import type { UploadSlot } from '@/src/lib/upload'

// Shared single-image uploader (wizard media step + pending-flush). Returns
// the public URL or a machine-readable error code for local messaging.
export async function uploadImageFile(
  file: File,
  eventId: string,
  slot: UploadSlot,
): Promise<{ url: string } | { error: string }> {
  const form = new FormData()
  form.append('file', file)
  form.append('eventId', eventId)
  form.append('slot', slot)
  let response: Response
  try {
    response = await fetch('/api/upload', { method: 'POST', body: form })
  } catch {
    return { error: 'NETWORK_ERROR' }
  }
  const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null
  if (!response.ok || !body?.url) return { error: body?.error ?? 'UPLOAD_FAILED' }
  return { url: body.url }
}
