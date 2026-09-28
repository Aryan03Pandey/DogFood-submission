import { NextResponse } from "next/server";
import { scoreClearSchema, scoreSchema } from "@/src/lib/api/judging-schemas";
import { clearScore, getJudgeScores, saveJudgeScore } from "@/src/server/judging-service";
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from "@/src/server/http";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const targetJudgeId = url.searchParams.get("judge") ?? session.user.id;
    const eventId = url.searchParams.get("eventId") ?? undefined;
    const rows = await getJudgeScores(session.user, targetJudgeId, eventId);
    return NextResponse.json({ scores: rows });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await parseBody(request, scoreSchema);
    return NextResponse.json(await saveJudgeScore(session.user, body));
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}

// Score clearing (judge dashboard Clear action): deletes the caller's saved
// score for one of their own assignments and reopens it.
export async function DELETE(request: Request) {
  try {
    const session = await requireSession();
    const body = await parseBody(request, scoreClearSchema);
    return NextResponse.json(await clearScore(session.user, body.assignmentId));
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
