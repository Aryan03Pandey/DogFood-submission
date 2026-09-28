import { cookies } from 'next/headers'
import GalleryBrowser from '@/components/gallery-browser'
import { getGalleryProjects } from '@/src/server/gallery-service'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Project Gallery | Dogfood 2026',
  description: 'Browse published projects from completed hackathons.',
}

interface SearchParams {
  seed?: string
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const params = await searchParams
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('dogfood_session')?.value
  const seed = params?.seed ?? sessionToken ?? undefined

  const projects = await getGalleryProjects(new Date(), seed)

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <h1 className="text-[28px] font-bold tracking-[-0.03em] text-foreground">
        Project Gallery
      </h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        Published projects from completed hackathons. {projects.length}{' '}
        {projects.length === 1 ? 'project' : 'projects'} on display.
      </p>
      <GalleryBrowser projects={projects} />
    </main>
  )
}