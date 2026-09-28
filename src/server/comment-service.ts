import { and, asc, eq } from 'drizzle-orm'
import { db } from '../db'
import {
  submissionComments,
  submissions,
  teams,
  users,
  type DbUser,
} from '../db/schema'
import { AuthError } from './auth-service'
import { assertEventOrganizer } from './event-service'
import { checkRateLimit } from './anti-abuse-service'
import { recordAuditLog } from './audit-service'
import { MAX_COMMENT_BODY, sanitizeCommentText } from '../../lib/comment-text'

async function resolveEventId(submissionId: string): Promise<string> {
  const [row] = await db
    .select({ eventId: teams.eventId })
    .from(submissions)
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .where(eq(submissions.id, submissionId))
    .limit(1)
  if (!row) throw new AuthError('SUBMISSION_NOT_FOUND', 404)
  return row.eventId
}

export interface CommentRow {
  id: string
  authorName: string
  body: string
  createdAt: string
}

// Public thread for a finalized submission. Hidden (moderated) comments are
// only visible to organizers; everyone else sees the public thread.
export async function listComments(
  actor: DbUser | null,
  submissionId: string,
): Promise<{ comments: CommentRow[]; moderator: boolean }> {
  const eventId = await resolveEventId(submissionId)
  let moderator = false
  if (actor) {
    try {
      await assertEventOrganizer(actor, eventId)
      moderator = true
    } catch {
      moderator = false
    }
  }
  const rows = await db
    .select({
      id: submissionComments.id,
      authorName: submissionComments.authorName,
      body: submissionComments.body,
      isHidden: submissionComments.isHidden,
      createdAt: submissionComments.createdAt,
    })
    .from(submissionComments)
    .where(eq(submissionComments.submissionId, submissionId))
    .orderBy(asc(submissionComments.createdAt))
  const comments = rows
    .filter((row) => moderator || !row.isHidden)
    .map((row) => ({
      id: row.id,
      authorName: row.authorName,
      body: row.body,
      createdAt: row.createdAt?.toISOString() ?? '',
    }))
  return { comments, moderator }
}

// Posting needs a session (spam control); content is length-checked and
// rate-limited per author.
export async function postComment(
  actor: DbUser,
  submissionId: string,
  body: string,
): Promise<CommentRow> {
  const text = sanitizeCommentText(body)
  if (text.length === 0) throw new AuthError('COMMENT_EMPTY', 400)
  if (text.length > MAX_COMMENT_BODY) throw new AuthError('COMMENT_TOO_LONG', 400)
  checkRateLimit(`comment:${actor.id}`, 10, 60_000)
  await resolveEventId(submissionId)
  const [user] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, actor.id)).limit(1)
  const [row] = await db
    .insert(submissionComments)
    .values({
      submissionId,
      authorId: actor.id,
      authorName: user?.name ?? user?.email ?? 'A voter',
      body: text,
    })
    .returning()
  await recordAuditLog({
    actorId: actor.id,
    action: 'COMMENT_POSTED',
    entityType: 'SUBMISSION',
    entityId: submissionId,
  })
  return {
    id: row.id,
    authorName: row.authorName,
    body: row.body,
    createdAt: row.createdAt?.toISOString() ?? '',
  }
}

// Organizer moderation is a soft hide so the thread stays readable.
export async function hideComment(
  actor: DbUser,
  submissionId: string,
  commentId: string,
): Promise<{ commentId: string; hidden: boolean }> {
  const eventId = await resolveEventId(submissionId)
  await assertEventOrganizer(actor, eventId)
  const [row] = await db
    .select({ id: submissionComments.id })
    .from(submissionComments)
    .where(and(eq(submissionComments.id, commentId), eq(submissionComments.submissionId, submissionId)))
    .limit(1)
  if (!row) throw new AuthError('COMMENT_NOT_FOUND', 404)
  await db.update(submissionComments).set({ isHidden: true }).where(eq(submissionComments.id, commentId))
  await recordAuditLog({
    actorId: actor.id,
    action: 'COMMENT_HIDDEN',
    entityType: 'SUBMISSION',
    entityId: submissionId,
    payloadJson: { commentId },
  })
  return { commentId, hidden: true }
}
