// Shared upload rules for event media (logo, banner, card). Used by the
// wizard form (pre-upload errors) and POST /api/upload (re-validated
// server-side — the form check is convenience, this module is enforcement).

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export const ALLOWED_IMAGE_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
] as const

export type UploadSlot = 'logo' | 'banner' | 'card'

export const UPLOAD_DIMENSION_HINTS: Record<UploadSlot, string> = {
  logo: 'Square, at least 256 × 256 px (PNG or SVG recommended)',
  banner: 'Wide, 1600 × 400 px works best across screen sizes',
  card: 'Card banner, 800 × 450 px (16:9)',
}

export function uploadErrorFor(input: {
  mime: string | null | undefined
  sizeBytes: number | null | undefined
  filename: string | null | undefined
}): 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'MISSING_FILE' | null {
  if (input.mime == null || input.sizeBytes == null || input.filename == null) {
    return 'MISSING_FILE'
  }
  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(input.mime)) return 'UNSUPPORTED_TYPE'
  if (input.sizeBytes > MAX_UPLOAD_BYTES) return 'TOO_LARGE'
  return null
}

// events/<eventId>/<slot>-<epoch>-<sanitized-name>: unique per upload,
// scoped per event, no user input in the path beyond a cleaned filename.
export function buildStorageKey(slot: UploadSlot, eventId: string, filename: string): string {
  const base = filename
    .split('/')
    .pop()!
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80)
  const safe = base === '' || base === '.' ? 'image' : base
  return `events/${eventId}/${slot}-${Date.now()}-${safe}`
}

// Public read base for filer-stored files. The browser cannot resolve the
// in-compose hostname, so this must be host-reachable (dev publishes 8888).
export function publicUploadUrl(path: string): string {
  const base = process.env.SEAWEEDFS_PUBLIC_URL ?? 'http://localhost:8888'
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}
