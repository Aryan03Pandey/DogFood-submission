import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import EventCard from '@/components/event-card'
import { getHackathonEvents } from '@/src/server/hackathons-service'
import { isShowcaseEvent } from '@/src/lib/hackathons'

// Homepage showcase: real events from the database — live and upcoming only.
// Past events live on the /hackathons page under their own tab.
export default async function ActiveHackathons() {
  const events = (await getHackathonEvents()).filter((event) => isShowcaseEvent(event.tab))

  return (
    <section id="hackathons" aria-label="Live and upcoming events" className="bg-background">
      <div className="mx-auto max-w-5xl scroll-mt-20 px-5 py-12 md:py-16">
        <h2 className="text-center text-[22px] font-bold tracking-[-0.02em] text-foreground">
          Live &amp; Upcoming Events
        </h2>
        <p className="mt-2 text-center text-[13px] text-muted-foreground">
          {events.length === 0
            ? 'No live or upcoming events right now — check back soon.'
            : `${events.length} ${events.length === 1 ? 'event' : 'events'} accepting hackers right now.`}
        </p>
        {events.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
        <div className="mt-6 text-center">
          <Link
            href="/hackathons"
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-10 px-5')}
          >
            Explore more <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}
