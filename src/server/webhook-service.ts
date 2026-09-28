import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { webhookDeliveries, webhookEndpoints, type DbUser } from "../db/schema";
import { AuthError, getEffectiveRole } from "./auth-service";
import { recordAuditLog } from "./audit-service";
import { assertSafeWebhookUrl } from "./webhook-url-guard";

async function assertOrganizer(actor: DbUser, eventId: string) {
  const role = await getEffectiveRole(actor, eventId);
  if (role !== "SUPERADMIN" && role !== "ORGANIZER") throw new AuthError("FORBIDDEN", 403);
}

export interface IssuedWebhook {
  id: string;
  url: string;
  secret: string; // shown once, at creation only
  createdAt: Date;
}

export async function registerWebhook(actor: DbUser, eventId: string, url: string): Promise<IssuedWebhook> {
  await assertOrganizer(actor, eventId);
  await assertSafeWebhookUrl(url);
  const secret = randomBytes(32).toString("hex");
  const [row] = await db
    .insert(webhookEndpoints)
    .values({ eventId, url, secret, createdBy: actor.id })
    .returning();
  await recordAuditLog({
    actorId: actor.id,
    action: "webhook.endpoint_created",
    entityType: "webhook_endpoint",
    entityId: row.id,
    payloadJson: { url },
  });
  return { id: row.id, url: row.url, secret, createdAt: row.createdAt };
}

export async function listWebhooks(actor: DbUser, eventId: string) {
  await assertOrganizer(actor, eventId);
  return db
    .select({
      id: webhookEndpoints.id,
      url: webhookEndpoints.url,
      isActive: webhookEndpoints.isActive,
      createdAt: webhookEndpoints.createdAt,
    })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.eventId, eventId));
}

export async function revokeWebhook(actor: DbUser, eventId: string, webhookId: string): Promise<boolean> {
  await assertOrganizer(actor, eventId);
  // Scoped to (id AND eventId): same "can't tell not-yours from doesn't-
  // exist" shape as token-service.ts#revokeToken.
  const [row] = await db
    .delete(webhookEndpoints)
    .where(and(eq(webhookEndpoints.id, webhookId), eq(webhookEndpoints.eventId, eventId)))
    .returning({ id: webhookEndpoints.id });
  if (row) {
    await recordAuditLog({
      actorId: actor.id,
      action: "webhook.endpoint_revoked",
      entityType: "webhook_endpoint",
      entityId: row.id,
      payloadJson: null,
    });
  }
  return !!row;
}

// Sends a one-off webhook.test delivery to exactly one endpoint (not every
// endpoint on the event, unlike enqueueWebhookEvent below) — an organizer
// checking "is my receiver actually listening" wants to ping the one
// endpoint they're looking at, not fan out to every registered endpoint.
// webhook.test has no entry in the partial unique index, so nothing stops
// an organizer from sending several in a row.
export async function sendTestWebhook(actor: DbUser, eventId: string, webhookId: string): Promise<boolean> {
  await assertOrganizer(actor, eventId);
  const [endpoint] = await db
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.id, webhookId), eq(webhookEndpoints.eventId, eventId)))
    .limit(1);
  if (!endpoint) return false;
  await db.insert(webhookDeliveries).values({
    endpointId: endpoint.id,
    eventId,
    eventType: "webhook.test",
    payloadJson: { message: "This is a test delivery from Dogfood 2026.", sentAt: new Date().toISOString() },
  });
  return true;
}

// The outbox write. No endpoints registered for this event -> zero rows ->
// zero outbound calls from the worker, which is what keeps this
// OFFLINE_MODE-compatible by default. The bare onConflictDoNothing() (no
// explicit target) relies on drizzle/0016_webhooks.sql's partial unique
// index, which only exists for the two singleton event types
// (judging.completed, results.published) — submission.created has no
// matching constraint, so it always inserts.
export async function enqueueWebhookEvent(
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const endpoints = await db
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.eventId, eventId), eq(webhookEndpoints.isActive, true)));
  if (endpoints.length === 0) return;
  await db
    .insert(webhookDeliveries)
    .values(endpoints.map((endpoint) => ({ endpointId: endpoint.id, eventId, eventType, payloadJson: payload })))
    .onConflictDoNothing();
}
