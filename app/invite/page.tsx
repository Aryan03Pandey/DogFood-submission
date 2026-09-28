import Link from 'next/link'
import { Ticket } from 'lucide-react'

import { resolveInviteToken } from '@/src/server/team-service'
import { InviteJoin } from '@/components/event-page/invite-join'

interface SearchParams {
  token?: string
}

// Online invite links land here: /invite?token=…. The token resolves to its
// event and team; one button joins (signed-in, registered users).
export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { token } = await searchParams
  const resolved = token ? await resolveInviteToken(token) : null

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-card p-10 text-center">
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <Ticket size={22} strokeWidth={1.8} />
        </span>
        {!resolved ? (
          <>
            <p className="text-[15px] font-bold text-foreground">Invalid invite code</p>
            <p className="max-w-sm text-[13px] text-muted-foreground">
              This link is missing its code or the code matches no team. Ask the team leader for
              a fresh invite.
            </p>
            <Link
              href="/hackathons"
              className="mt-2 inline-flex h-10 items-center rounded-lg border border-border px-5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
            >
              Browse events
            </Link>
          </>
        ) : (
          <>
            <p className="text-[15px] font-bold text-foreground">
              You&apos;re invited to {resolved.teamName}
            </p>
            <p className="max-w-sm text-[13px] text-muted-foreground">
              {resolved.eventTitle}
              {resolved.expired ? ' — but this invite code has expired.' : ''}
            </p>
            {resolved.expired ? (
              <>
                <p className="text-[12px] font-semibold text-destructive">
                  Ask the team leader to generate a new invite code.
                </p>
                <Link
                  href={`/hackathons/${resolved.eventSlug}`}
                  className="mt-2 inline-flex h-10 items-center rounded-lg border border-border px-5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
                >
                  Back to event
                </Link>
              </>
            ) : (
              <div className="mt-2">
                <InviteJoin
                  eventId={resolved.eventId}
                  eventSlug={resolved.eventSlug}
                  teamName={resolved.teamName}
                  token={token ?? ''}
                />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
