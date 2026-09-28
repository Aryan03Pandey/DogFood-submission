import { createHash } from 'node:crypto'
import { AuthError } from './auth-service'

const ipRequestLog = new Map<string, number[]>()

export function getClientIp(request: Request): string {
  const headers = request.headers
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0].trim()
    if (first) return first
  }
  return (
    headers.get('x-real-ip') ??
    headers.get('cf-connecting-ip') ??
    headers.get('x-client-ip') ??
    '127.0.0.1'
  )
}

export function generateVoterFingerprint(
  request: Request,
  userId?: string | null,
): string {
  const ip = getClientIp(request)
  const userAgent = request.headers.get('user-agent') ?? 'unknown-ua'
  const acceptLang = request.headers.get('accept-language') ?? 'unknown-lang'
  const secChUa = request.headers.get('sec-ch-ua') ?? ''
  const secChUaPlatform = request.headers.get('sec-ch-ua-platform') ?? ''

  const raw = [ip, userAgent, acceptLang, secChUa, secChUaPlatform, userId ?? ''].join('|')
  return createHash('sha256').update(raw).digest('hex')
}

export function checkRateLimit(
  key: string,
  maxAllowed = 15,
  windowMs = 60_000,
): void {
  const now = Date.now()
  const windowStart = now - windowMs
  const history = (ipRequestLog.get(key) ?? []).filter((time) => time > windowStart)

  if (history.length >= maxAllowed) {
    throw new AuthError('RATE_LIMITED', 429)
  }

  history.push(now)
  ipRequestLog.set(key, history)
}

export function validateHoneypot(honeypotField: unknown): void {
  if (
    typeof honeypotField === 'string' &&
    honeypotField.trim().length > 0
  ) {
    throw new AuthError('BOT_DETECTED', 400)
  }
}

export function validateSubmissionTiming(
  renderedAt: number | string | undefined,
  minDurationMs = 700,
): void {
  if (!renderedAt) return
  const start = typeof renderedAt === 'string' ? Number(renderedAt) : renderedAt
  if (Number.isFinite(start) && Date.now() - start < minDurationMs) {
    throw new AuthError('BOT_DETECTED', 400)
  }
}