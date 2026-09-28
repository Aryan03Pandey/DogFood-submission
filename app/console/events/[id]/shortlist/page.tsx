import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import Link from 'next/link'
import { ListChecks } from 'lucide-react'
import { AuthError, getEffectiveRole, getSessionUser, hasConsoleAccess } from '@/src/server/auth-service'
import { getEvent, serializeEvent } from '@/src/server/event-service'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

// Shortlist candidates (ADMIN-DASHBOARD.md Participants tab entry point).
// The shortlisting workflow does not exist yet, so this route renders an
// explicit empty state instead of a dead end.
export default async function ShortlistPage({ params }: Params) {
  const { id: eventId } = await params
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  const session = await getSessionUser(token)
  if (!session) redirect('/login')
  if (!(await hasConsoleAccess(session.user))) redirect('/my-hackathons')

  let event
  try {
    event = serializeEvent(await getEvent(eventId, session.user))
  } catch (error) {
    if (error instanceof AuthError) notFound()
    throw error
  }
  const role = await getEffectiveRole(session.user, eventId)
  if (role !== 'SUPERADMIN' && role !== 'ORGANIZER') redirect(`/console?eventId=${eventId}&tab=participants`)

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          {event.title}
        </p>
        <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-foreground">
          Shortlist candidates
        </h1>
        <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-10 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <ListChecks size={22} strokeWidth={1.8} />
          </span>
          <p className="text-[15px] font-bold text-foreground">No shortlist yet</p>
          <p className="max-w-sm text-[13px] text-muted-foreground">
            Candidate shortlisting opens once submissions arrive. Shortlisted participants will
            appear here.
          </p>
          <Link
            href={`/console?eventId=${eventId}&tab=participants`}
            className="mt-2 inline-flex h-10 items-center rounded-lg border border-border px-5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            Back to participants
          </Link>
        </div>
      </main>
  )
}
