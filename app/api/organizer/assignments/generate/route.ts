import { NextResponse } from "next/server";
import { assignmentGenerationSchema } from "@/src/lib/api/judging-schemas";
import { generateAssignments } from "@/src/server/judging-service";
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from "@/src/server/http";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await parseBody(request, assignmentGenerationSchema);
    return NextResponse.json(
      await generateAssignments(session.user, body.eventId, body.trackId),
    );
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
