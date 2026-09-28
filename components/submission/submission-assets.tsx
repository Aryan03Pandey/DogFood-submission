'use client'

import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, FileText, X } from 'lucide-react'

import { normalizeSubmissionAssets } from '@/src/lib/submissions'

function assetKind(mime: string, name: string): 'image' | 'video' | 'doc' | 'file' {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (
    mime === 'application/pdf' ||
    mime === 'application/vnd.ms-powerpoint' ||
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    /\.pdf$|\.pptx?$|\.key$/i.test(name)
  )
    return 'doc'
  return 'file'
}

// Shared submission asset gallery: identical for judges and community
// voters. Images expand in an in-page lightbox, videos play embedded,
// documents preview inline, anything else is a captioned download row.
export function SubmissionAssets({
  assetKeys,
  assetBase,
  bucket,
}: {
  assetKeys: unknown
  assetBase: string
  bucket: string
}) {
  const [expanded, setExpanded] = useState<{ url: string; name: string } | null>(null)

  const close = useCallback(() => setExpanded(null), [])
  useEffect(() => {
    if (!expanded) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, close])

  const assets = normalizeSubmissionAssets(assetKeys)
  if (assets.length === 0) return null

  return (
    <div className="mt-5 flex flex-col gap-4">
      <h3 className="text-[15px] font-bold text-foreground">Assets</h3>
      {assets.map((asset) => {
        const url = `${assetBase}/${bucket}/${asset.key}`
        const kind = assetKind(asset.mime, asset.name)
        return (
          <figure key={asset.key} className="overflow-hidden rounded-lg border border-border">
            <figcaption className="flex items-center gap-2 px-3 py-2 text-[12px] font-semibold text-foreground">
              <FileText size={13} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{asset.name}</span>
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[#16a34a] hover:underline">
                Open <ExternalLink size={12} strokeWidth={1.8} aria-hidden="true" />
              </a>
            </figcaption>
            {kind === 'image' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={asset.name}
                className="max-h-[480px] w-full cursor-zoom-in bg-muted object-contain"
                onClick={() => setExpanded({ url, name: asset.name })}
              />
            )}
            {kind === 'video' && (
              <video src={url} controls preload="metadata" className="max-h-[480px] w-full bg-black" />
            )}
            {kind === 'doc' && (
              <iframe src={url} title={asset.name} className="h-[480px] w-full bg-background" />
            )}
          </figure>
        )
      })}
      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Expanded image: ${expanded.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close expanded image"
            className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={expanded.url}
            alt={expanded.name}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
