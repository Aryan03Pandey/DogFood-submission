import { serialize } from 'cookie'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { AuthError, getSessionUser } from './auth-service'
import type { SessionUser } from './types'

export const SESSION_COOKIE = 'dogfood_session'

export function sessionCookieHeader(token: string, secure: boolean): string {
  return serialize(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export function clearSessionCookieHeader(): string {
  return serialize(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
}

export async function getRequestToken(): Promise<string> {
  const store = await cookies()
  return store.get(SESSION_COOKIE)?.value ?? ''
}

function isSecureRequest(request: Request): boolean {
  if (process.env.NODE_ENV === 'production') return true
  return new URL(request.url).protocol === 'https:'
}

export function jsonError(code: string, status: number): NextResponse {
  return NextResponse.json({ error: code }, { status })
}

export interface AuthLogContext {
  route: string
  method: string
}

// Structured auth failure reporting: one JSON line per rejected request so
// offline operators can tail server logs and see exactly which route, method,
// and error code failed. Client responses stay minimal (code only) to avoid
// leaking internals to the browser.
export function logAuthEvent(code: string, context: AuthLogContext, detail?: string): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      area: 'auth',
      code,
      route: context.route,
      method: context.method,
      ...(detail ? { detail } : {}),
    }),
  )
}

export function routeContext(request: Request): AuthLogContext {
  return { route: new URL(request.url).pathname, method: request.method }
}

export function authErrorResponse(error: unknown, context?: AuthLogContext): NextResponse {
  const fallback: AuthLogContext = { route: 'unknown', method: 'unknown' }
  const ctx = context ?? fallback
  if (error instanceof AuthError) {
    logAuthEvent(error.code, ctx)
    return jsonError(error.code, error.status)
  }
  if (error instanceof z.ZodError) {
    logAuthEvent('VALIDATION_ERROR', ctx)
    return NextResponse.json({ error: 'VALIDATION_ERROR', details: error.flatten() }, { status: 400 })
  }
  logAuthEvent('INTERNAL_ERROR', ctx, error instanceof Error ? error.message : String(error))
  return jsonError('INTERNAL_ERROR', 500)
}

export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const body = await request.json().catch(() => null)
  return schema.parse(body)
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSessionUser(await getRequestToken())
  if (!session) throw new AuthError('UNAUTHORIZED', 401)
  return session
}

export function withSessionCookie(response: NextResponse, token: string, request: Request): NextResponse {
  response.headers.set('Set-Cookie', sessionCookieHeader(token, isSecureRequest(request)))
  return response
}

export function withClearedSession(response: NextResponse): NextResponse {
  response.headers.set('Set-Cookie', clearSessionCookieHeader())
  return response
}

export function publicUser(user: { id: string; email: string; name: string | null; role: string; organization: string | null; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organization: user.organization,
    createdAt: user.createdAt.toISOString(),
  }
}
