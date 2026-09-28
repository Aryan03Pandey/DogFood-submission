import { NextResponse } from "next/server";
import { awardPrizeRequestSchema } from "@/src/lib/api/certificate-schema";
import { awardPrize, listPrizeAwards } from "@/src/server/certificate-service";
import { authErrorResponse, parseBody, requireSession, routeContext } from "@/src/server/http";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { id: eventId } = await params;
    return NextResponse.json({ awards: await listPrizeAwards(session.user, eventId) });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { id: eventId } = await params;
    const body = await parseBody(request, awardPrizeRequestSchema);
    const award = await awardPrize(session.user, eventId, body);
    return NextResponse.json({ award });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
