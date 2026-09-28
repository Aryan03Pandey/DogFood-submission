import { NextResponse } from "next/server";
import { pairwiseSchema } from "@/src/lib/api/judging-schemas";
import { submitPairwiseComparison } from "@/src/server/judging-service";
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from "@/src/server/http";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await parseBody(request, pairwiseSchema);
    return NextResponse.json(
      await submitPairwiseComparison(session.user, body),
      { status: 201 },
    );
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
