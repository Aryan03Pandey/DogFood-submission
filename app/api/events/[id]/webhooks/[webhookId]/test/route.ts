import { NextResponse } from "next/server";
import { sendTestWebhook } from "@/src/server/webhook-service";
import { authErrorResponse, jsonError, requireSession, routeContext } from "@/src/server/http";

interface Params {
  params: Promise<{ id: string; webhookId: string }>;
}

// Enqueues a one-off webhook.test delivery to this one endpoint — the
// worker picks it up on its next poll, same as any other delivery.
export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { id: eventId, webhookId } = await params;
    const sent = await sendTestWebhook(session.user, eventId, webhookId);
    if (!sent) return jsonError("WEBHOOK_NOT_FOUND", 404);
    return NextResponse.json({ sent: true });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
