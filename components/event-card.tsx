import Link from 'next/link'
import { Calendar } from 'lucide-react'

import type { HackathonEvent } from '@/src/lib/hackathons'

// Shared event card for the homepage showcase and the /hackathons tabs.
// Links to the public event page — deliberately no apply button; the event
// page owns registration.
export default function EventCard({
  event,
  heading = 'h3',
}: {
  event: HackathonEvent
  heading?: 'h2' | 'h3'
}) {
  const Title = heading
  return (
    <Link
      href={`/hackathons/${event.slug}`}
      aria-label={`${event.title} — view event`}
      className="flex flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-muted-foreground"
    >
      <div className="flex items-center justify-between gap-2">
        <Title className="text-[15px] font-bold text-foreground">{event.title}</Title>
        <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] font-semibold capitalize text-muted-foreground">
          {event.status.toLowerCase().replace('_', ' ')}
        </span>
      </div>
      <p className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Calendar size={14} strokeWidth={1.8} aria-hidden="true" />
        {event.dateLabel}
      </p>
    </Link>
  )
}
