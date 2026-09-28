import sanitizeHtml from 'sanitize-html'

// Single enforcement point for rich-text HTML (TipTap output). Everything
// not on the allowlist is stripped but its inner text is kept, so pasted
// web content degrades to clean text instead of breaking. Links always open
// in a new tab with an opener-safe rel.
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'sub',
  'sup',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
]

export function sanitizeDescriptionHtml(dirty: string | null | undefined): string | null {
  if (dirty == null) return null
  const clean = sanitizeHtml(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      // target/rel are added by transformTags below; listing them keeps
      // the attribute filter from stripping what the transform just set.
      a: ['href', 'title', 'target', 'rel'],
    },
    allowedStyles: {
      '*': {
        'text-align': [/^(left|center|right|justify)$/],
      },
    },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: '_blank', rel: 'noreferrer noopener' },
      }),
    },
  }).trim()
  return clean === '' ? null : clean
}
