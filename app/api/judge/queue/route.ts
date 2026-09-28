import { NextResponse } from "next/server";
import { eventIdQuerySchema } from "@/src/lib/api/judging-schemas";
import { getJudgeQueue } from "@/src/server/judging-service";
import {
  authErrorResponse,
  requireSession,
  routeContext,
} from "@/src/server/http";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const query = eventIdQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return NextResponse.json({
      assignments: await getJudgeQueue(session.user, query.eventId),
    });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
