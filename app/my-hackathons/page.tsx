import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getSessionUser } from '@/src/server/auth-service'
import { getMyEvents } from '@/src/server/event-service'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'My Hackathons | Dogfood 2026',
  description: 'Hackathons you are participating in or have participated in.',
}

// Personal list: only events the viewer is (or was) part of — never the
// full public catalog.
export default async function MyHackathonsPage() {
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  const session = await getSessionUser(token)
  if (!session?.user) redirect('/login')

  const events = await getMyEvents(session.user.id)

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        My Hackathons
      </p>
      <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-foreground">
        Hackathons you joined
      </h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        {events.length === 0
          ? 'You have not joined any hackathon yet.'
          : `${events.length} ${events.length === 1 ? 'event' : 'events'} you are participating in or have participated in.`}
      </p>
      {events.length > 0 && (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/hackathons/${event.slug}`}
                className="block rounded-xl border border-border bg-card p-6 transition-colors hover:border-muted-foreground"
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  {event.status}
                </p>
                <p className="mt-1 text-[15px] font-bold text-foreground">{event.title}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Your role: {event.myRole === 'TEAM_MEMBER' ? 'Hacker' : event.myRole}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
