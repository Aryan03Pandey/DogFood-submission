import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { getSessionUser } from '@/src/server/auth-service'
import { getJudgeQueue, judgesAnyEvent } from '@/src/server/judging-service'
import { JudgeDashboard } from '@/components/judge/judge-dashboard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Judge Dashboard | Dogfood 2026',
  description: 'Score assigned submissions.',
}

// Judge dashboard: visible only to users judging at least one event. The
// APIs re-enforce assignment scope; this only keeps the route honest.
export default async function JudgePage() {
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  const session = await getSessionUser(token)
  if (!session) redirect('/login')

  if (!(await judgesAnyEvent(session.user))) {
    return (
      <main className="mx-auto w-full max-w-5xl px-5 py-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Judging</p>
        <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-foreground">Judge dashboard</h1>
        <p className="mt-2 max-w-md text-[13px] text-muted-foreground">
          You are not judging any event right now. Once an organizer adds you as a judge, your
          assigned projects will appear here.
        </p>
      </main>
    )
  }

  const queue = await getJudgeQueue(session.user)
  // Host-reachable filer base for asset embeds; the browser cannot resolve
  // the in-compose hostname.
  const filerBase = (process.env.SEAWEEDFS_FILER_URL ?? 'http://localhost:8888').replace(/\/$/, '')
  const bucket = process.env.S3_BUCKET ?? 'dogfood-assets'

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Judging</p>
      <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-foreground">Judge dashboard</h1>
      <div className="mt-6">
        <JudgeDashboard initial={queue} assetBase={filerBase} bucket={bucket} />
      </div>
    </main>
  )
}
