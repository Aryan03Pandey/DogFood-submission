import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { getSessionUser } from '@/src/server/auth-service'
import { EventWizard } from '@/components/console/event-wizard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'New Event | Dogfood 2026',
  description: 'Create a hackathon event, step by step.',
}

// Creation wizard entry (EVENT-CREATION.md). SUPERADMIN-only like POST
// /api/events; everyone else gets an access notice instead of a wizard
// that could never save.
export default async function NewEventPage() {
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  const session = await getSessionUser(token)
  if (!session) redirect('/login')

  return (
    <main className="mx-auto max-w-[1440px] px-5 py-12">
        <h1 className="text-[28px] font-bold tracking-[-0.03em] text-foreground">Host an Event</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Seven steps, saved as you go. Events start as DRAFT — invisible until their schedule opens them.
        </p>
        <div className="mt-6">
          {session.user.role === 'SUPERADMIN' ? (
            <EventWizard tracks={[]} />
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
              <p className="text-[13px] text-muted-foreground">
                Only superadmins can create events. Ask an admin, or have one assign you as an
                organizer on an existing event.
              </p>
            </div>
          )}
        </div>
      </main>
  )
}
