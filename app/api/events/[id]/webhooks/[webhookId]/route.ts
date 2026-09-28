import { NextResponse } from "next/server";
import { revokeWebhook } from "@/src/server/webhook-service";
import { authErrorResponse, jsonError, requireSession, routeContext } from "@/src/server/http";

interface Params {
  params: Promise<{ id: string; webhookId: string }>;
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { id: eventId, webhookId } = await params;
    const revoked = await revokeWebhook(session.user, eventId, webhookId);
    if (!revoked) return jsonError("WEBHOOK_NOT_FOUND", 404);
    return NextResponse.json({ webhookId, revoked: true });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
