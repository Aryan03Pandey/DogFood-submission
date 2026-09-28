import { NextResponse } from "next/server";
import { rubricSchema } from "@/src/lib/api/judging-schemas";
import { saveRubric } from "@/src/server/judging-service";
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from "@/src/server/http";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await parseBody(request, rubricSchema);
    return NextResponse.json(await saveRubric(session.user, body), {
      status: body.id ? 200 : 201,
    });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
