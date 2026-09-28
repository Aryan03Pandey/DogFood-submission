import { NextResponse } from "next/server";
import { generateParticipantCertificate } from "@/src/server/certificate-service";
import { authErrorResponse, requireSession, routeContext } from "@/src/server/http";

interface Params {
  params: Promise<{ id: string; submissionId: string }>;
}

// Tier 4.7. ?format=json returns the signed envelope instead of the PDF —
// the PDF is the shareable artifact, the envelope is what /verify checks.
// ?user= lets an organizer/superadmin generate another team member's
// certificate; defaults to the caller (same convention as GET /api/judge/scores).
export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { id: eventId, submissionId } = await params;
    const url = new URL(request.url);
    const recipientUserId = url.searchParams.get("user") ?? undefined;
    const { pdf, envelope } = await generateParticipantCertificate(
      session.user,
      eventId,
      submissionId,
      recipientUserId,
    );
    if (url.searchParams.get("format") === "json") return NextResponse.json(envelope);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="certificate-participant-${submissionId}.pdf"`,
      },
    });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
