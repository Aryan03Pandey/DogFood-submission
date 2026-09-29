import argon2 from 'argon2'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { createSessionToken, hashSessionToken } from '../lib/auth'
import {
  canAssignEventRole,
  eventRoles,
  events,
  resolveEffectiveRole,
  sessions,
  users,
  type DbUser,
  type EventRole,
  type UserRole,
} from '../db/schema'
import type {
  AssignEventRoleInput,
  CreateUserInput,
  IssuedSession,
  SessionUser,
} from './types'
import { recordAuditLog } from './audit-service'

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export class AuthError extends Error {
  status: number
  constructor(
    public code: string,
    status: number,
  ) {
    super(code)
    this.status = status
  }
}

// Passwords -------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MiB
    timeCost: 3,
    parallelism: 4,
  })
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

// Role normalization (accepts the CLI/documented `admin` alias). --------------

const ROLE_ALIASES: Record<string, UserRole> = {
  superadmin: 'SUPERADMIN',
  admin: 'SUPERADMIN',
  organizer: 'ORGANIZER',
  judge: 'JUDGE',
  participant: 'PARTICIPANT',
}

export function normalizeRole(input: string): UserRole | null {
  return ROLE_ALIASES[input.trim().toLowerCase()] ?? null
}

function normalizeEventRole(input: string): EventRole | null {
  const role = normalizeRole(input)
  return role === 'ORGANIZER' || role === 'JUDGE' || role === 'PARTICIPANT' ? role : null
}

export function normalizeRoleInput(input: string, eventScoped: boolean): UserRole | EventRole | null {
  return eventScoped ? normalizeEventRole(input) : normalizeRole(input)
}

// Users -----------------------------------------------------------------------

export async function createUser(input: CreateUserInput): Promise<DbUser> {
  const email = input.email.trim().toLowerCase()
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing.length > 0) throw new AuthError('EMAIL_TAKEN', 409)
  const passwordHash = await hashPassword(input.password)
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, role: input.role ?? 'PARTICIPANT', organization: input.organization })
    .returning()
  return user
}

export async function authenticate(email: string, password: string): Promise<DbUser> {
  const normalized = email.trim().toLowerCase()
  const [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1)
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw new AuthError('INVALID_CREDENTIALS', 401)
  }
  return user
}

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1)
  return user ?? null
}

// Password rotation from Account Settings: proves the current password,
// then stores the new hash. New-password strength is enforced by the route
// schema (passwordSchema), so this only gates on the credential replaced.
export async function changePassword(
  actor: DbUser,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1)
  if (!user) throw new AuthError('NOT_FOUND', 404)
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AuthError('INVALID_CREDENTIALS', 401)
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(users.id, actor.id))
}

// Server-only user listing for dogfood-cli (scripts/cli.ts). This is NOT an
// HTTP endpoint — there is deliberately no /api/users route, so no caller
// over the network can enumerate accounts. The result is intentionally
// unbounded (oldest-first): it serves an offline admin tool, not a paginated
// public endpoint, and instance user counts stay in the hundreds.
export async function listUsers(): Promise<DbUser[]> {
  return db.select().from(users).orderBy(users.createdAt)
}

// Sessions (opaque, revocable; only the hash is stored). ------------------------

export async function createSession(userId: string): Promise<IssuedSession> {
  const token = createSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.insert(sessions).values({ id: hashSessionToken(token), userId, expiresAt })
  return { token, expiresAt }
}

export async function getSessionUser(token: string): Promise<SessionUser | null> {
  if (!token) return null
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, hashSessionToken(token)))
    .limit(1)
  if (!row) return null
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, hashSessionToken(token)))
    return null
  }
  return row
}

export async function revokeSession(token: string): Promise<void> {
  if (!token) return
  await db.delete(sessions).where(eq(sessions.id, hashSessionToken(token)))
}

// Event-contextual roles ---------------------------------------------------------

export async function getEventRole(userId: string, eventId: string): Promise<EventRole | null> {
  const [row] = await db
    .select({ role: eventRoles.role })
    .from(eventRoles)
    .where(and(eq(eventRoles.userId, userId), eq(eventRoles.eventId, eventId)))
    .limit(1)
  return row?.role ?? null
}

export async function getEffectiveRole(user: DbUser, eventId: string): Promise<UserRole> {
  if (user.role === 'SUPERADMIN') return 'SUPERADMIN'
  return resolveEffectiveRole(user.role, await getEventRole(user.id, eventId))
}

export async function listEventRoles(eventId: string) {
  return db.select().from(eventRoles).where(eq(eventRoles.eventId, eventId))
}

export async function listUserEventRoles(userId: string) {
  return db.select().from(eventRoles).where(eq(eventRoles.userId, userId))
}

// Global role grant (Event Settings "Admin" option). Only SUPERADMINs may
// change global flags; promoting someone to SUPERADMIN gives instance-wide
// access, so this never runs through the event-scoped role table.
export async function setGlobalRole(actor: DbUser, targetUserId: string, role: UserRole) {
  if (actor.role !== 'SUPERADMIN') throw new AuthError('FORBIDDEN', 403)
  if (targetUserId === actor.id) throw new AuthError('CANNOT_MODIFY_SELF', 409)
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId)).limit(1)
  if (!target) throw new AuthError('USER_NOT_FOUND', 404)
  const [updated] = await db.update(users).set({ role }).where(eq(users.id, targetUserId)).returning()
  await recordAuditLog({
    actorId: actor.id,
    action: 'GLOBAL_ROLE_MODIFIED',
    entityType: 'USER',
    entityId: targetUserId,
    payloadJson: { role },
  });
  return updated
}

export async function assignEventRole(input: AssignEventRoleInput) {
  const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, input.eventId)).limit(1)
  if (!event) throw new AuthError('EVENT_NOT_FOUND', 404)
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.targetUserId)).limit(1)
  if (!target) throw new AuthError('USER_NOT_FOUND', 404)
  const actorRole = await getEffectiveRole(input.actor, input.eventId)
  if (!canAssignEventRole(actorRole, input.role)) throw new AuthError('FORBIDDEN', 403)
  const [existing] = await db
    .select({ id: eventRoles.id, role: eventRoles.role })
    .from(eventRoles)
    .where(and(eq(eventRoles.eventId, input.eventId), eq(eventRoles.userId, input.targetUserId)))
    .limit(1)
  // Participants cannot be lifted onto the organizers team: staffing and
  // hacking are mutually exclusive.
  if (input.role === 'ORGANIZER' && existing?.role === 'PARTICIPANT') {
    throw new AuthError('FORBIDDEN', 403)
  }
  if (existing) {
    const [updated] = await db
      .update(eventRoles)
      .set({ role: input.role })
      .where(eq(eventRoles.id, existing.id))
      .returning()
    return updated
  }
  const [created] = await db
    .insert(eventRoles)
    .values({ eventId: input.eventId, userId: input.targetUserId, role: input.role })
    .returning()
  await recordAuditLog({
    actorId: input.actor.id,
    action: 'EVENT_ROLE_ASSIGNED',
    entityType: 'EVENT',
    entityId: input.eventId,
    payloadJson: { targetUserId: input.targetUserId, role: input.role },
  });

  return created
}

// Offline impersonation gate -----------------------------------------------------

export function isImpersonationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' && env.OFFLINE_MODE === 'true'
}

// Browser storage model (auth threat surface) ----------------------------------
//
// The browser holds exactly ONE value: an opaque 256-bit random token in an
// HttpOnly, Secure (production), SameSite=Lax cookie. JavaScript cannot read
// it, and no user id, email, or role is EVER stored client-side (no JWTs, no
// localStorage). On every request the server hashes the presented token,
// looks up the sessions row, and re-resolves identity plus the effective role
// from users/event_roles in Postgres.
//
// This means a role cannot be changed from the browser: there is nothing to
// edit, and any forged or tampered cookie value matches no stored session
// hash, so the request fails closed with 401. Guessing a live token requires
// 2^256 tries. A stolen token works until revokeSession deletes its row, so
// logout and admin kicks take effect instantly — use short TTLs and Secure
// cookies in production to shrink that window further.
//
// Auth failures are reported through logAuthEvent in ./http (one JSON line
// per rejected request with route, method, and error code) so offline
// operators can tail server logs instead of flying blind.