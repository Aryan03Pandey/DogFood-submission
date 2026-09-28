import { NextResponse } from "next/server";
import { revokePrizeAward } from "@/src/server/certificate-service";
import { authErrorResponse, jsonError, requireSession, routeContext } from "@/src/server/http";

interface Params {
  params: Promise<{ id: string; awardId: string }>;
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { id: eventId, awardId } = await params;
    const revoked = await revokePrizeAward(session.user, eventId, awardId);
    if (!revoked) return jsonError("AWARD_NOT_FOUND", 404);
    return NextResponse.json({ awardId, revoked: true });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
