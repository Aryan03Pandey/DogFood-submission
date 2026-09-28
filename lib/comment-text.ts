// Single enforcement point for submission comment text. Comments are plain
// text (rendered as-is, never as HTML), so sanitizing means: drop anything
// that looks like markup, strip control characters that break layout or
// enable terminal/clipboard tricks, trim, and cap the length. Safe to import
// from client components and the server alike.
export const MAX_COMMENT_BODY = 2000

export function sanitizeCommentText(dirty: string): string {
  return dirty
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, MAX_COMMENT_BODY)
}
