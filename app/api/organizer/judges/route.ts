import { NextResponse } from "next/server";
import { judgeInviteSchema, judgeRemovalSchema } from "@/src/lib/api/judging-schemas";
import { getEventJudges, inviteJudge, listJudgeCandidates, removeJudge } from "@/src/server/judging-service";
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from "@/src/server/http";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await parseBody(request, judgeInviteSchema);
    const role = await inviteJudge(session.user, body.eventId, body.userId);
    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}

// Candidate search (?eventId=&q=): users with their current event role so
// the UI can exclude same-event participants. Also returns the current
// judge roster so the UI can resync after mutations without a remount.
// Organizer-only.
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const eventId = url.searchParams.get("eventId") ?? undefined;
    if (!eventId) return NextResponse.json({ error: "EVENT_REQUIRED" }, { status: 400 });
    const [candidates, judges] = await Promise.all([
      listJudgeCandidates(session.user, eventId, url.searchParams.get("q") ?? undefined),
      getEventJudges(session.user, eventId),
    ]);
    return NextResponse.json({ eventId, candidates, judges });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}

// Judge removal: organizer-only, password-confirmed. Orphaned assignments
// are reassigned with the event's selected algorithm; the response reports
// the orphan/reassign counts plus anything still unresolved.
export async function DELETE(request: Request) {
  try {
    const session = await requireSession();
    const body = await parseBody(request, judgeRemovalSchema);
    return NextResponse.json(
      await removeJudge(session.user, body.eventId, body.userId, body.password),
    );
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
