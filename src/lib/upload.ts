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

// Public read URL for filer-stored files. Same-origin by default
// (/api/files/…) so browsers never touch the filer directly — its address
// is a localhost/compose hostname that visitors can't resolve and that
// private-network-access blocks from public pages. An explicit
// SEAWEEDFS_PUBLIC_URL (e.g. a CDN in front of the filer) still wins.
export function publicUploadUrl(path: string): string {
  const base = process.env.SEAWEEDFS_PUBLIC_URL
  if (base) return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
  return `/api/files/${path.replace(/^\//, '')}`
}

// Public URL for one submission asset. Submission galleries (judge, project,
// voting) receive the raw filer base, which browsers cannot reach when it is
// a localhost/compose address — route those through the same-origin proxy.
// Real CDN/public bases pass through untouched.
export function submissionAssetUrl(assetBase: string, bucket: string, key: string): string {
  const direct = `${assetBase.replace(/\/$/, '')}/${bucket}/${key}`
  return resolveFileUrl(direct) ?? direct
}

// Rewrites legacy absolute filer URLs (rows written before the same-origin
// proxy, e.g. http://localhost:8888/<bucket>/<key>) to /api/files/… so old
// events heal without a migration. Anything else passes through untouched.
export function resolveFileUrl(url: string | null | undefined): string | null {
  if (url == null || url === '') return null
  if (url.startsWith('/api/files/')) return url
  const filerMatch = url.match(/^https?:\/\/([^/]+)\/(.+)$/)
  if (!filerMatch) return url
  const host = filerMatch[1].toLowerCase().split(':')[0]
  // Only rewrite addresses that can never be visitor-reachable: localhost,
  // loopback, or the in-compose filer hostname. Real CDNs/public hosts
  // (even with ports) pass through untouched.
  if (/(^|\.)localhost$/.test(host) || host.startsWith('127.') || host.includes('seaweedfs')) {
    return `/api/files/${filerMatch[2]}`
  }
  return url
}
