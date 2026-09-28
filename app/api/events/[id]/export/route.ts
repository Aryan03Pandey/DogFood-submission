import { streamCsvRows } from '@/src/server/judging-service'
import {
  getEventExportTables,
} from '@/src/server/dashboard-service'
import {
  authErrorResponse,
  requireSession,
  routeContext,
} from '@/src/server/http'

interface Params {
  params: Promise<{ id: string }>
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function section(name: string, columns: string[], rows: unknown[][]): string {
  const lines = [`# --- ${name} ---`, columns.map(csvCell).join(',')]
  for (const row of rows) lines.push(row.map(csvCell).join(','))
  return lines.join('\r\n') + '\r\n'
}

// Full event export: one CSV document, one section per purpose. Small
// tables materialize; the judging section streams through the batched
// keyset generator so large events never balloon memory.
export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession()
    const { id: eventId } = await params
    const tables = await getEventExportTables(session.user, eventId)

    const judgingColumns = [
      'submission_id',
      'submission_title',
      'team_name',
      'judge_id',
      'judge_name',
      'assignment_status',
      'raw_total',
      'flag_reason',
      'score_count',
      'raw_mean',
      'z_score',
      'min_max',
      'trimmed_mean',
    ]

    const encoder = new TextEncoder()
    const batches = streamCsvRows(session.user, eventId)
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const push = (text: string) => controller.enqueue(encoder.encode(text))
        try {
          push(`# event: ${tables.eventTitle} (${tables.eventStatus})\r\n`)
          push(`# exported_at: ${new Date().toISOString()}\r\n`)
          push(
            section(
              'participants',
              ['email', 'name', 'organization', 'team', 'member_role', 'registered_at'],
              tables.participants.map((p) => [p.email, p.name, p.organization, p.teamName, p.memberRole, p.registeredAt]),
            ),
          )
          push(
            section(
              'teams',
              ['name', 'members', 'finalized'],
              tables.teams.map((t) => [t.name, t.memberCount, t.finalized ? 'yes' : 'no']),
            ),
          )
          push(
            section(
              'submissions',
              ['title', 'team', 'track', 'status', 'hidden', 'repo_url', 'demo_url', 'submitted_at'],
              tables.submissions.map((s) => [
                s.title,
                s.teamName,
                s.trackName,
                s.status,
                s.isHidden ? 'yes' : 'no',
                s.repoUrl,
                s.demoUrl,
                s.submittedAt,
              ]),
            ),
          )
          push([`# --- judging ---`, judgingColumns.join(',')].join('\r\n') + '\r\n')
          for await (const batch of batches) {
            for (const row of batch) {
              push(
                [
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
                ]
                  .map(csvCell)
                  .join(',') + '\r\n',
              )
            }
          }
          push(
            section(
              'voting',
              ['submission', 'team', 'track', 'votes', 'voters', 'comments'],
              tables.voting.map((v) => [v.title, v.teamName, v.trackName, v.totalVotes, v.voterCount, v.commentCount]),
            ),
          )
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })
    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="event-${eventId}-export.csv"`,
      },
    })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
