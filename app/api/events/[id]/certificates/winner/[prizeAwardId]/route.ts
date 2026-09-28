import { NextResponse } from "next/server";
import { generateWinnerCertificate } from "@/src/server/certificate-service";
import { authErrorResponse, requireSession, routeContext } from "@/src/server/http";

interface Params {
  params: Promise<{ id: string; prizeAwardId: string }>;
}

// Tier 4.7. Same ?format=json / ?user= shape as the participant certificate route.
export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { id: eventId, prizeAwardId } = await params;
    const url = new URL(request.url);
    const recipientUserId = url.searchParams.get("user") ?? undefined;
    const { pdf, envelope } = await generateWinnerCertificate(
      session.user,
      eventId,
      prizeAwardId,
      recipientUserId,
    );
    if (url.searchParams.get("format") === "json") return NextResponse.json(envelope);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="certificate-winner-${prizeAwardId}.pdf"`,
      },
    });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
