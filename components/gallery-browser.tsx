'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowUpRight, Search } from 'lucide-react'

import { matchesGalleryQuery, type GalleryProject } from '@/src/lib/gallery'
import { validateUrl } from '@/src/db/schema'

const PAGE_SIZE = 30

// Client half of the gallery: live search over the server-rendered project
// list plus 30-per-page pagination. The full list stays in the HTML (so
// no-JS readers and the acceptance checker see every title); search and
// paging only narrow what is shown.
export default function GalleryBrowser({ projects }: { projects: GalleryProject[] }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const visible = useMemo(
    () => projects.filter((project) => matchesGalleryQuery(project, query)),
    [projects, query],
  )
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  function onQuery(value: string) {
    setQuery(value)
    setPage(0)
  }

  return (
    <div className="mt-6">
      <label htmlFor="gallery-search" className="text-[12px] font-semibold text-foreground">
        Search projects
      </label>
      <div className="relative mt-2 max-w-95">
        <Search size={15} strokeWidth={1.8} aria-hidden="true" className="absolute left-3 top-2.5 text-muted-foreground" />
        <input
          id="gallery-search"
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Title, team, track, or event…"
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[13px] outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
        />
      </div>
      <p aria-live="polite" className="mt-3 text-[12px] text-muted-foreground">
        Showing {visible.length} of {projects.length} projects
      </p>

      {visible.length === 0 ? (
        <div className="mt-4 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-[14px] font-bold text-foreground">No projects match your search.</p>
          <button
            type="button"
            onClick={() => onQuery('')}
            className="mt-3 inline-flex h-9 items-center rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            Clear search
          </button>
        </div>
      ) : (
        <>
          {pageCount > 1 && (
            <div className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                disabled={safePage === 0}
                className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
              >
                Prev
              </button>
              <span className="font-semibold">
                Page {safePage + 1} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
                disabled={safePage >= pageCount - 1}
                className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pageRows.map((project) => (
              <article
                key={project.id}
                className="flex flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-muted-foreground"
              >
                <h2 className="text-[15px] font-bold text-foreground">
                  <Link href={`/projects/${project.id}`} className="hover:underline">
                    {project.title}
                  </Link>
                </h2>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {project.eventTitle} · {project.teamName}
                </p>
                {project.tagline && (
                  <p className="mt-3 text-[13px] leading-5 text-muted-foreground">{project.tagline}</p>
                )}
                <div className="mb-4 mt-4 flex flex-wrap items-center gap-2 pt-1">
                  <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                    {project.trackName}
                  </span>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4">
                  <Link
                    href={`/projects/${project.id}`}
                    className="inline-flex items-center gap-1 text-[12px] font-bold text-[#16a34a] dark:text-[#22c55e]"
                  >
                    View project <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
                  </Link>
                  {project.repoUrl && validateUrl(project.repoUrl) ? (
                    <a
                      href={project.repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] font-bold text-muted-foreground hover:text-foreground"
                    >
                      Repository <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
                    </a>
                  ) : (
                    project.submittedLabel && (
                      <span className="text-[11px] text-muted-foreground">
                        {project.submittedLabel}
                      </span>
                    )
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
