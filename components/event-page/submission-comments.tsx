'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, Trash2 } from 'lucide-react'

import {
  ApiError,
  apiHideComment,
  apiListComments,
  apiPostComment,
  type SubmissionCommentPayload,
} from '@/lib/api-client'
import { MAX_COMMENT_BODY, sanitizeCommentText } from '@/lib/comment-text'

// Public comment thread for one submission (Tier-3 voting page). Anyone can
// read; posting needs a session; organizers see a Hide control per comment.
export function SubmissionComments({
  eventId,
  submissionId,
}: {
  eventId: string
  submissionId: string
}) {
  const [comments, setComments] = useState<SubmissionCommentPayload[]>([])
  const [moderator, setModerator] = useState(false)
  const [draft, setDraft] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function refresh() {
    try {
      const { comments, moderator } = await apiListComments(eventId, submissionId)
      setComments(comments)
      setModerator(moderator)
    } catch {
      setError('Could not load comments.')
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, submissionId])

  async function post() {
    if (draft.trim() === '' || working) return
    // Sanitize client-side before the API call: strip markup and control
    // characters, enforce the length cap. The server re-sanitizes and the
    // route schema rejects over-long bodies regardless.
    const clean = sanitizeCommentText(draft)
    if (clean === '') {
      setError('That comment has no text after cleanup.')
      return
    }
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const { comment } = await apiPostComment(eventId, submissionId, clean)
      setComments((rows) => [...rows, comment])
      setDraft('')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UNAUTHORIZED') {
        setError('Sign in to join the discussion.')
      } else {
        setError('Could not post that comment. Try again.')
      }
    } finally {
      setWorking(false)
    }
  }

  async function hide(commentId: string) {
    setWorking(true)
    setError(null)
    try {
      await apiHideComment(eventId, submissionId, commentId)
      setComments((rows) => rows.filter((row) => row.id !== commentId))
      setNotice('Comment hidden.')
    } catch {
      setError('Could not hide that comment.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-border p-4">
      <h5 className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
        <MessageSquare size={14} strokeWidth={1.8} aria-hidden="true" />
        Discussion ({comments.length})
      </h5>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void post()
        }}
      >
        <label htmlFor={`comment-${submissionId}`} className="sr-only">
          Add a comment
        </label>
        <input
          id={`comment-${submissionId}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a comment"
          maxLength={MAX_COMMENT_BODY}
          className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
        />
        <button
          type="submit"
          disabled={working || draft.trim() === ''}
          className="inline-flex h-10 items-center rounded-lg bg-[#16a34a] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
        >
          {working ? 'Posting…' : 'Post'}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-[12px] font-semibold text-destructive">
          {error}{' '}
          {error === 'Sign in to join the discussion.' && (
            <a href="/login" className="underline">
              Sign in
            </a>
          )}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-2 text-[12px] font-semibold text-[#16a34a] dark:text-[#22c55e]">
          {notice}
        </p>
      )}
      {comments.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted-foreground">No comments yet. Start the discussion.</p>
      ) : (
        <ul className="mt-2 flex max-h-64 flex-col gap-2 overflow-y-auto">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="flex items-center gap-2 text-[12px]">
                <span className="font-bold text-foreground">{comment.authorName}</span>
                <span className="text-muted-foreground">
                  {comment.createdAt ? new Date(comment.createdAt).toLocaleString(undefined, { timeZone: 'UTC' }) : ''}
                </span>
                {moderator && (
                  <button
                    type="button"
                    onClick={() => void hide(comment.id)}
                    disabled={working}
                    aria-label={`Hide comment by ${comment.authorName}`}
                    className="ml-auto inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-[11px] font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
                  >
                    <Trash2 size={12} strokeWidth={1.8} aria-hidden="true" /> Hide
                  </button>
                )}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-foreground">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
