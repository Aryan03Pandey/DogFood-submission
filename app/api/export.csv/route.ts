import { streamCsvRows } from "@/src/server/judging-service";
import {
  authErrorResponse,
  requireSession,
  routeContext,
} from "@/src/server/http";

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const eventId =
      new URL(request.url).searchParams.get("eventId") ?? undefined;
    const columns = [
      "event_id",
      "event_title",
      "normalization",
      "submission_id",
      "submission_title",
      "team_name",
      "judge_id",
      "judge_name",
      "assignment_status",
      "raw_total",
      "flag_reason",
      "score_count",
      "raw_mean",
      "z_score",
      "min_max",
      "trimmed_mean",
    ];
    const encoder = new TextEncoder();
    const batches = streamCsvRows(session.user, eventId);
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(`${columns.join(",")}\r\n`));
        try {
          for await (const batch of batches) {
            for (const row of batch) {
              const record = [
                row.eventId,
                row.eventTitle,
                row.normalization,
                row.submissionId,
                row.submissionTitle,
                row.teamName,
                row.judgeId,
                row.judgeName,
                row.assignmentStatus,
                row.rawTotal,
                row.flagReason,
                row.ranking?.scoreCount,
                row.ranking?.raw,
                row.ranking?.zScore,
                row.ranking?.minMax,
                row.ranking?.trimmedMean,
              ];
              controller.enqueue(
                encoder.encode(`${record.map(csvCell).join(",")}\r\n`),
              );
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="judging-results.csv"',
      },
    });
  } catch (error) {
    return authErrorResponse(error, routeContext(request));
  }
}
