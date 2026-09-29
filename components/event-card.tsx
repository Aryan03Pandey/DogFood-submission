import Link from 'next/link'
import { ArrowUpRight, Calendar, ImageIcon } from 'lucide-react'

import type { HackathonEvent } from '@/src/lib/hackathons'
import { resolveFileUrl } from '@/src/lib/upload'

// Shared event card for the homepage showcase and the /hackathons tabs.
// Big banner-first card: the whole card links to the public event page
// (registration lives there — deliberately no apply button here). A themed
// fallback block covers events without an organizer-uploaded banner.
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
      className="group flex h-[360px] w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-cyan-400/60 hover:shadow-[0_0_36px_rgba(34,211,238,0.22)]"
    >
      {resolveFileUrl(event.cardBannerUrl) ? (
        <img
          src={resolveFileUrl(event.cardBannerUrl)!}
          alt=""
          loading="lazy"
          className="h-44 w-full shrink-0 object-cover md:h-56"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-44 w-full shrink-0 items-center justify-center bg-muted md:h-56"
        >
          <ImageIcon size={36} strokeWidth={1.5} className="text-muted-foreground" />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          <Title className="min-w-0 break-words text-[22px] font-bold leading-snug tracking-[-0.01em] text-foreground line-clamp-2 min-h-[62px]">
            {event.title}
          </Title>
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold capitalize text-muted-foreground">
            {event.status.toLowerCase().replace('_', ' ')}
          </span>
        </div>
        <p className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
          <Calendar size={15} strokeWidth={1.8} aria-hidden="true" />
          {event.dateLabel}
        </p>
        <p className="mt-auto inline-flex items-center gap-1 pt-4 text-[14px] font-bold text-cyan-700 transition-colors group-hover:text-cyan-600 dark:text-cyan-300 dark:group-hover:text-cyan-200">
          View event
          <ArrowUpRight size={15} strokeWidth={2} aria-hidden="true" />
        </p>
      </div>
    </Link>
  )
}
