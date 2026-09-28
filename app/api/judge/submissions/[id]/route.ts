import { NextResponse } from "next/server";
import { getAssignedSubmission } from "@/src/server/judging-service";
import {
  authErrorResponse,
  requireSession,
  routeContext,
} from "@/src/server/http";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;
    return NextResponse.json(await getAssignedSubmission(session.user, id));
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
