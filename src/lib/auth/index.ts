import { randomBytes, createHash } from 'node:crypto'

export const argon2Options = { type: 'argon2id', memoryCost: 65536, timeCost: 3, parallelism: 4 } as const
export function createSessionToken() { return randomBytes(32).toString('base64url') }
export function hashSessionToken(token: string) { return createHash('sha256').update(token).digest('hex') }
export function cookieOptions() { return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 * 7 } }
export function canAccess(role: string, allowed: string[]) { return allowed.includes(role) }
export function requireRole(role: string | undefined, allowed: string[]) { if (!role || !canAccess(role, allowed)) throw new Error('Forbidden') }
export function hashInviteToken(token: string) { return createHash('sha256').update(token).digest('hex') }
export function fingerprint(input: string) { return createHash('sha256').update(input).digest('hex').slice(0, 32) }
