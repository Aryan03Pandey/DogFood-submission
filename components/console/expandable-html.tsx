'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

// Collapsible rich-text block: long HTML is clamped to a fixed height with
// an inline "Show more" text toggle (a quiet link-styled button, not a
// bulky CTA). The toggle only appears when content actually overflows;
// short descriptions render untouched with no toggle at all.
export function ExpandableHtml({
  html,
  collapsedLines = 6,
}: {
  html: string
  collapsedLines?: 4 | 5 | 6 | 8
}) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = bodyRef.current
    if (el) setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [html, expanded, collapsedLines])

  return (
    <div>
      <div
        ref={bodyRef}
        dangerouslySetInnerHTML={{ __html: html }}
        className={cn(
          'text-[13px] leading-6 text-foreground [&_a]:font-semibold [&_a]:text-[#16a34a] [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5',
          !expanded &&
            (collapsedLines === 4
              ? 'line-clamp-4'
              : collapsedLines === 5
                ? 'line-clamp-5'
                : collapsedLines === 8
                  ? 'line-clamp-8'
                  : 'line-clamp-6'),
        )}
      />
      {(expanded || overflows) && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="mt-1 text-[12px] font-semibold text-[#16a34a] underline-offset-2 hover:underline dark:text-[#22c55e]"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
