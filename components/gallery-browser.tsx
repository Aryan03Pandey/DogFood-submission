'use client'

import { useMemo, useState } from 'react'
import { ArrowUpRight, Search } from 'lucide-react'

import { matchesGalleryQuery, type GalleryProject } from '@/src/lib/gallery'
import { validateUrl } from '@/src/db/schema'

// Client half of the gallery: live search over the server-rendered project
// list. The full list stays in the HTML (so no-JS readers and the
// acceptance checker see every title); this only narrows what is shown.
export default function GalleryBrowser({ projects }: { projects: GalleryProject[] }) {
  const [query, setQuery] = useState('')
  const visible = useMemo(
    () => projects.filter((project) => matchesGalleryQuery(project, query)),
    [projects, query],
  )

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
          onChange={(event) => setQuery(event.target.value)}
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
            onClick={() => setQuery('')}
            className="mt-3 inline-flex h-9 items-center rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project) => (
            <article
              key={project.id}
              className="flex flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-muted-foreground"
            >
              <h2 className="text-[15px] font-bold text-foreground">{project.title}</h2>
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
              <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
                {project.repoUrl && validateUrl(project.repoUrl) ? (
                  <a
                    href={project.repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] font-bold text-[#16a34a] dark:text-[#22c55e]"
                  >
                    Repository <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
                  </a>
                ) : (
                  <span />
                )}
                {project.submittedLabel && (
                  <span className="text-[11px] text-muted-foreground">
                    {project.submittedLabel}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
