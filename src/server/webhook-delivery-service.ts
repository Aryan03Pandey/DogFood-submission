import { eq } from "drizzle-orm";
import { db, sql } from "../db";
import { webhookDeliveries, webhookEndpoints } from "../db/schema";
import { canonicalize } from "../lib/canonical-json";
import { computeWebhookSignature } from "./webhook-signing";
import { assertSafeWebhookUrl } from "./webhook-url-guard";

// Tier 4.5 delivery worker logic (scripts/webhook-worker.ts is a thin entry
// point around processBatch — kept out of scripts/ so it's importable by
// tests without triggering the script's poll loop / real DB connection).

export const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const BATCH_SIZE = 20;

export function nextAttemptDelayMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

export interface DeliveryAttemptInput {
  url: string;
  secret: string;
  eventType: string;
  deliveryId: string;
  payload: Record<string, unknown>;
}

export interface DeliveryAttemptResult {
  ok: boolean;
  status?: number;
  error?: string;
}

// DB-agnostic on purpose — unit-testable with a mocked fetch, no DB.
export async function attemptDelivery(input: DeliveryAttemptInput): Promise<DeliveryAttemptResult> {
  // Re-checked here, not just at registration time — a hostname that
  // resolved safely when the endpoint was registered could have been
  // repointed at an internal address since (DNS rebinding).
  try {
    await assertSafeWebhookUrl(input.url);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unsafe webhook url" };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = computeWebhookSignature(input.secret, timestamp, input.payload);
  try {
    const response = await fetch(input.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-dogfood-event": input.eventType,
        "x-dogfood-delivery": input.deliveryId,
        "x-dogfood-timestamp": String(timestamp),
        "x-dogfood-signature": `sha256=${signature}`,
      },
      body: canonicalize(input.payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) return { ok: true, status: response.status };
    return { ok: false, status: response.status, error: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "request failed" };
  }
}

interface ClaimedRow {
  id: string;
  endpoint_id: string;
  event_id: string;
  event_type: string;
  payload_json: Record<string, unknown>;
  attempts: number;
}

// Atomic claim: one statement (UPDATE...WHERE id IN (SELECT ... FOR UPDATE
// SKIP LOCKED) RETURNING *), not select-then-update, which would race two
// worker replicas. The `status = 'IN_PROGRESS' AND lease_until < now()`
// branch reclaims rows a crashed/killed worker never finished — no separate
// cleanup job needed.
async function claimBatch(): Promise<ClaimedRow[]> {
  return sql<ClaimedRow[]>`
    UPDATE webhook_deliveries
    SET status = 'IN_PROGRESS', lease_until = now() + interval '30 seconds'
    WHERE id IN (
      SELECT id FROM webhook_deliveries
      WHERE (status = 'PENDING' AND next_attempt_at <= now())
         OR (status = 'IN_PROGRESS' AND lease_until < now())
      ORDER BY next_attempt_at
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, endpoint_id, event_id, event_type, payload_json, attempts
  `;
}

async function processRow(row: ClaimedRow): Promise<void> {
  const [endpoint] = await db
    .select({ url: webhookEndpoints.url, secret: webhookEndpoints.secret })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, row.endpoint_id))
    .limit(1);
  if (!endpoint) {
    await db
      .update(webhookDeliveries)
      .set({ status: "FAILED", leaseUntil: null, lastError: "endpoint no longer exists" })
      .where(eq(webhookDeliveries.id, row.id));
    return;
  }

  const result = await attemptDelivery({
    url: endpoint.url,
    secret: endpoint.secret,
    eventType: row.event_type,
    deliveryId: row.id,
    payload: row.payload_json,
  });

  if (result.ok) {
    await db
      .update(webhookDeliveries)
      .set({ status: "DELIVERED", deliveredAt: new Date(), leaseUntil: null })
      .where(eq(webhookDeliveries.id, row.id));
    return;
  }

  const attempts = row.attempts + 1;
  const exhausted = attempts >= MAX_ATTEMPTS;
  await db
    .update(webhookDeliveries)
    .set({
      status: exhausted ? "FAILED" : "PENDING",
      attempts,
      nextAttemptAt: new Date(Date.now() + nextAttemptDelayMs(attempts)),
      leaseUntil: null,
      lastError: result.error ?? "unknown error",
    })
    .where(eq(webhookDeliveries.id, row.id));
}

export async function processBatch(): Promise<number> {
  const claimed = await claimBatch();
  await Promise.all(claimed.map(processRow));
  return claimed.length;
}
