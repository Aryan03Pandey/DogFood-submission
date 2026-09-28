import { desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { auditLogs, type DbUser } from '../db/schema'
import { assertEventOrganizer } from './event-service'

export interface RecordAuditLogInput {
  actorId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  payloadJson?: Record<string, unknown> | null
}

export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: input.actorId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    payloadJson: input.payloadJson ?? null,
  })
}

export async function getEventAuditLogs(
  actor: DbUser,
  eventId: string,
  limit = 100,
) {
  await assertEventOrganizer(actor, eventId)
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.entityId, eventId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
}