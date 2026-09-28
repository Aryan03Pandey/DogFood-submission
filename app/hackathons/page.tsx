import { getHackathonEvents } from '@/src/server/hackathons-service'
import HackathonTabs from '@/components/hackathon-tabs'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Hackathons | Dogfood 2026',
  description: 'Browse live, upcoming, and past hackathons.',
}

export default async function HackathonsPage() {
  const events = await getHackathonEvents()

  return (
    <main className="mx-auto max-w-5xl px-5 py-12 w-full">
      <h1 className="text-[28px] font-bold tracking-[-0.03em] text-foreground">Hackathons</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        {events.length} {events.length === 1 ? 'event' : 'events'} on this portal.
      </p>
      <HackathonTabs events={events} />
    </main>
  )
}
