import { cookies } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'

import { getSessionUser } from '@/src/server/auth-service'
import { getGalleryProjectById } from '@/src/server/gallery-service'
import { SubmissionAssets } from '@/components/submission/submission-assets'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

// Public project page: the full submission — details, assets, and a path
// back to its event. Drafts and hidden work always 404; in-flight work is
// visible to its own team, gallery-visible work to everyone.
export default async function ProjectPage({ params }: Params) {
  const { id } = await params
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  const session = await getSessionUser(token)
  const project = await getGalleryProjectById(id, new Date(), session?.user.id ?? null)
  if (!project) notFound()

  const filerBase = (process.env.SEAWEEDFS_FILER_URL ?? 'http://localhost:8888').replace(/\/$/, '')
  const bucket = process.env.S3_BUCKET ?? 'dogfood-assets'
  const techStack = Array.isArray(project.techStack) ? project.techStack : []

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/hackathons/${project.eventSlug}`}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" /> {project.eventTitle}
        </Link>
      </div>
      <article className="mt-4 rounded-xl border border-border bg-card p-6">
        <p className="text-[12px] font-bold text-muted-foreground">
          {project.trackName} · By {project.teamName}
        </p>
        <h1 className="mt-1 text-[24px] font-bold tracking-[-0.02em] text-foreground">
          {project.title}
        </h1>
        {project.tagline && (
          <p className="mt-1 text-[14px] text-muted-foreground">{project.tagline}</p>
        )}
        {project.description && (
          <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
            {project.description}
          </p>
        )}
        {techStack.length > 0 && (
          <p className="mt-3 text-[12px] text-muted-foreground">
            Stack: <span className="font-semibold text-foreground">{techStack.join(', ')}</span>
          </p>
        )}
        {(project.repoUrl || project.demoUrl) && (
          <div className="mt-3 flex flex-wrap gap-3 text-[13px] font-bold">
            {project.repoUrl && (
              <a
                href={project.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[#16a34a] hover:underline"
              >
                Repository <ExternalLink size={13} strokeWidth={1.8} aria-hidden="true" />
              </a>
            )}
            {project.demoUrl && (
              <a
                href={project.demoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[#16a34a] hover:underline"
              >
                Live demo <ExternalLink size={13} strokeWidth={1.8} aria-hidden="true" />
              </a>
            )}
          </div>
        )}
        <SubmissionAssets assetKeys={project.assetKeys} assetBase={filerBase} bucket={bucket} />
      </article>
    </main>
  )
}
