import { NextResponse } from "next/server";
import { getResultsManifest } from "@/src/server/records-service";
import { authErrorResponse, routeContext } from "@/src/server/http";

interface Params {
  params: Promise<{ id: string }>;
}

// Tier 4.6. Public and unauthenticated once results are PUBLISHED — no
// requireSession() call here on purpose, see records-service.ts's comment.
export async function GET(request: Request, { params }: Params) {
  try {
    const { id: eventId } = await params;
    const envelope = await getResultsManifest(eventId);
    return NextResponse.json(envelope, {
      headers: { "content-disposition": `attachment; filename="event-${eventId}-results-manifest.json"` },
    });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
