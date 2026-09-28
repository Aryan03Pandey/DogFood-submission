import { NextResponse } from "next/server";
import { registerWebhookRequestSchema } from "@/src/lib/api/webhook-schema";
import { listWebhooks, registerWebhook } from "@/src/server/webhook-service";
import { authErrorResponse, parseBody, requireSession, routeContext } from "@/src/server/http";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { id: eventId } = await params;
    return NextResponse.json({ webhooks: await listWebhooks(session.user, eventId) });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}

// The returned secret is shown exactly once, here — never returned by GET,
// same treatment as an API token's raw value (token-service.ts).
export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { id: eventId } = await params;
    const body = await parseBody(request, registerWebhookRequestSchema);
    const webhook = await registerWebhook(session.user, eventId, body.url);
    return NextResponse.json({ webhook });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
