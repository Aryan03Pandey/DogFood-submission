import { NextResponse } from "next/server";
import { getJudgeRecord } from "@/src/server/records-service";
import { authErrorResponse, jsonError, requireSession, routeContext } from "@/src/server/http";

// Tier 4.6. Same ?eventId=&judge= convention as GET /api/judge/scores
// (judging-service.ts#getJudgeScores) — judge defaults to the caller.
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const eventId = url.searchParams.get("eventId");
    if (!eventId) return jsonError("EVENT_ID_REQUIRED", 400);
    const targetJudgeId = url.searchParams.get("judge") ?? session.user.id;
    const envelope = await getJudgeRecord(session.user, eventId, targetJudgeId);
    return NextResponse.json(envelope);
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
