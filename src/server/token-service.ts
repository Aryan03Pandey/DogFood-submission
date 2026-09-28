import { randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { apiTokens, auditLogs, users, type DbUser } from '../db/schema'
import { hashSessionToken } from '../lib/auth'

const TOKEN_PREFIX = 'dfk_'

export interface IssuedToken {
  id: string
  token: string // shown once, at creation only
  name: string
  createdAt: Date
}

export async function createToken(userId: string, name: string): Promise<IssuedToken> {
  const token = TOKEN_PREFIX + randomBytes(24).toString('base64url')
  const [row] = await db
    .insert(apiTokens)
    .values({ userId, name, tokenHash: hashSessionToken(token), tokenPrefix: token.slice(0, 12) })
    .returning()
  await db.insert(auditLogs).values({
    actorId: userId,
    action: 'token.created',
    entityType: 'api_token',
    entityId: row.id,
    payloadJson: { name, tokenPrefix: row.tokenPrefix },
  })
  return { id: row.id, token, name: row.name, createdAt: row.createdAt }
}

export async function listTokens(userId: string) {
  return db.select().from(apiTokens).where(eq(apiTokens.userId, userId)).orderBy(apiTokens.createdAt)
}

export async function revokeToken(userId: string, tokenId: string): Promise<boolean> {
  // Scoped to (id AND userId): a token id that exists but belongs to someone
  // else matches zero rows here, exactly like a not-found id — the caller
  // (app/api/tokens/[id]/route.ts) can't tell "not yours" from "doesn't
  // exist", which is the point (no ownership oracle via response shape).
  const [row] = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id })
  if (row) {
    await db.insert(auditLogs).values({
      actorId: userId,
      action: 'token.revoked',
      entityType: 'api_token',
      entityId: row.id,
    })
  }
  return !!row
}

// Resolves a raw `Authorization: Bearer dfk_...` token to its owning user,
// exactly like getSessionUser resolves a session cookie — same hash-then-
// lookup shape, so the caller can treat both the same way. Returns null for
// a missing, malformed, revoked, or unknown token (never throws).
export async function getUserByToken(bearerHeader: string | null): Promise<DbUser | null> {
  if (!bearerHeader?.startsWith('Bearer ')) return null
  const token = bearerHeader.slice('Bearer '.length).trim()
  if (!token.startsWith(TOKEN_PREFIX)) return null

  const [row] = await db
    .select({ user: users, revokedAt: apiTokens.revokedAt, tokenId: apiTokens.id })
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(eq(apiTokens.tokenHash, hashSessionToken(token)))
    .limit(1)
  if (!row || row.revokedAt) return null

  // Best-effort, fire-and-forget — a failed write here must never block or
  // fail the request that's actually using the token.
  void (async () => {
    try {
      await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.tokenId))
    } catch {
      // ignore
    }
  })()

  return row.user
}
