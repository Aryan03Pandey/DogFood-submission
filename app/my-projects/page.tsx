import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getSessionUser } from '@/src/server/auth-service'
import { getMyProjects } from '@/src/server/gallery-service'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'My Projects | Dogfood 2026',
  description: 'Projects you built in past and current hackathons.',
}

// Personal list: only submissions on the viewer's own teams. Each card
// links to the project page, which links onward to its event.
export default async function MyProjectsPage() {
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  const session = await getSessionUser(token)
  if (!session?.user) redirect('/login')

  const projects = await getMyProjects(session.user.id)

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        My Projects
      </p>
      <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-foreground">
        Projects you built
      </h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        {projects.length === 0
          ? 'No submissions yet. Join a hackathon and ship something.'
          : `${projects.length} ${projects.length === 1 ? 'submission' : 'submissions'} across your hackathons.`}
      </p>
      {projects.length > 0 && (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex h-full flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-muted-foreground"
              >
                <p className="text-[15px] font-bold text-foreground">{project.title}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {project.eventTitle} · {project.teamName}
                </p>
                {project.tagline && (
                  <p className="mt-3 text-[13px] leading-5 text-muted-foreground">{project.tagline}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
