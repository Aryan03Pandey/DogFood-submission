import { createHmac } from "node:crypto";
import { canonicalize } from "../lib/canonical-json";

// Tier 4.5. HMAC covers `${timestamp}.${body}`, not the body alone — same
// shape as Stripe/GitHub webhook signing — so a receiver can reject a
// stale/replayed delivery by checking the timestamp is recent, not just
// that the signature matches. This repo doesn't ship a receiver; this is
// what an integrator's receiver is expected to verify.
export function computeWebhookSignature(secret: string, timestamp: number, body: unknown): string {
  const signedContent = `${timestamp}.${canonicalize(body)}`;
  return createHmac("sha256", secret).update(signedContent).digest("hex");
}
