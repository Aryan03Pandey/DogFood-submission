import { headers } from 'next/headers'

// The origin embed snippets/signed-content verify URLs should point at.
// PUBLIC_BASE_URL is the source of truth (set per deployment); when unset,
// falls back to the incoming request's own host/proto rather than a
// hardcoded localhost, so it still works behind a proxy or on a non-default
// dev port.
export async function getPublicBaseUrl(): Promise<string> {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '')
  const store = await headers()
  const proto = store.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  const host = store.get('x-forwarded-host') ?? store.get('host') ?? 'localhost:3000'
  return `${proto}://${host}`
}
