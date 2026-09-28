import { NextResponse } from "next/server";
import { flagSchema, unflagSchema } from "@/src/lib/api/judging-schemas";
import { flagSubmission, unflagSubmission } from "@/src/server/judging-service";
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from "@/src/server/http";

// Flag a submission (judge dashboard Flag action): one live flag per
// assignment, visible only to the reporter and organizers.
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await parseBody(request, flagSchema);
    return NextResponse.json(await flagSubmission(session.user, body), {
      status: 201,
    });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSession();
    const body = await parseBody(request, unflagSchema);
    return NextResponse.json(
      await unflagSubmission(session.user, body.assignmentId),
    );
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
