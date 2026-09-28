import { NextResponse } from "next/server";
import { judgeTracksSchema } from "@/src/lib/api/judging-schemas";
import { setJudgeTracks } from "@/src/server/judging-service";
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from "@/src/server/http";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { id: judgeId } = await params;
    const body = await parseBody(request, judgeTracksSchema);
    return NextResponse.json(
      await setJudgeTracks(session.user, body.eventId, judgeId, body.trackIds),
    );
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
