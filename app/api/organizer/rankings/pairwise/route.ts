import { NextResponse } from "next/server";
import { getPairwiseRankings } from "@/src/server/judging-service";
import {
  authErrorResponse,
  requireSession,
  routeContext,
} from "@/src/server/http";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const eventId = z
      .string()
      .uuid()
      .parse(new URL(request.url).searchParams.get("eventId"));
    return NextResponse.json({
      rankings: await getPairwiseRankings(session.user, eventId),
    });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
