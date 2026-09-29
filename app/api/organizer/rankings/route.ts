import { NextResponse } from "next/server";
import { getRankings } from "@/src/server/assignment-service";
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
      rankings: await getRankings(session.user, eventId),
    });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
