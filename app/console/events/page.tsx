import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'

import { getSessionUser, hasConsoleAccess } from '@/src/server/auth-service'
import { listManagedEvents, serializeEvent } from '@/src/server/event-service'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'My Events | Dogfood 2026',
  description: 'Organizer event list.',
}

export default async function ConsoleEventsPage() {
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  const session = await getSessionUser(token)
  if (!session) redirect('/login')
  if (!(await hasConsoleAccess(session.user))) redirect('/my-hackathons')
  // Management entry point: only events this viewer organizes (admins see
  // everything). Using listEvents here would leak every non-draft event
  // into the console for participants and judges.
  const events = (await listManagedEvents(session.user)).map(serializeEvent)
  const canCreate = session.user.role === 'SUPERADMIN'

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold tracking-[-0.03em] text-foreground">My Events</h1>
            <p className="mt-2 text-[13px] text-muted-foreground">
              {events.length} {events.length === 1 ? 'event' : 'events'} you can manage.
            </p>
          </div>
          {canCreate && (
            <Link
              href="/console/events/new"
              className="inline-flex h-10 shrink-0 items-center rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d]"
            >
              New event
            </Link>
          )}
        </div>

        {events.length === 0 ? (
          <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-[14px] font-bold text-foreground">No events yet.</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {canCreate ? 'Create the first one to get started.' : 'Ask an admin to assign you as an organizer.'}
            </p>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-2">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/console/events/${event.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-muted-foreground"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-foreground">{event.title}</p>
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">/{event.slug}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] font-semibold capitalize text-muted-foreground">
                    {event.status.toLowerCase().replace('_', ' ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
  )
}
