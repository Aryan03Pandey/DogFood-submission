import { notFound } from 'next/navigation'
import { getEventGalleryProjects } from '@/src/server/gallery-service'
import { ResizeReporter } from './resize-reporter'

interface Props {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ theme?: string; track?: string; limit?: string }>
}

// Chrome-less embeddable gallery, loaded inside an iframe by public/embed.js.
// Public data only — never gated on a session, since cross-site iframes never
// carry this app's SameSite=Lax cookie anyway.
export default async function EmbedGalleryPage({ params, searchParams }: Props) {
  const { eventId } = await params
  const { theme, track, limit } = await searchParams

  // Only a positive integer is a meaningful limit. Array.prototype.slice
  // treats a negative count as "from the end", so passing e.g. -5 straight
  // through would silently drop the last 5 projects instead of meaning "no
  // limit" — reject anything else (non-numeric, zero, negative) instead.
  const parsedLimit = limit ? Number.parseInt(limit, 10) : NaN
  const projects = await getEventGalleryProjects(eventId, {
    track,
    limit: Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
  })

  if (projects === null) notFound()

  return (
    <div className={theme === 'dark' ? 'dark' : undefined}>
      <ResizeReporter />
      <main className="w-full bg-background p-4 text-foreground">
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No public projects yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {projects.map((project) => (
              <li key={project.id} className="rounded-xl border border-border bg-background p-4">
                <a
                  href={project.repoUrl ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-bold text-foreground hover:underline"
                >
                  {project.title}
                </a>
                {project.tagline && <p className="mt-1 text-xs text-muted-foreground">{project.tagline}</p>}
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {project.teamName} · {project.trackName}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
