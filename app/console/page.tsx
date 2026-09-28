import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import Link from 'next/link'
import { AuthError, getEffectiveRole, getSessionUser } from '@/src/server/auth-service'
import {
  getDashboardOverview,
  listDashboardGallery,
  listDashboardParticipants,
  listDashboardSubmissions,
  listDashboardSubmissionsPage,
  listEventMembers,
} from '@/src/server/dashboard-service'
import { getEvent, listEvents, serializeEvent } from '@/src/server/event-service'
import {
  getAssignmentProgress,
  getEventJudges,
  getRankings,
  getRubric,
} from '@/src/server/judging-service'
import { getVotingAnalytics } from '@/src/server/voting-service'
import { GalleryPanel } from '@/components/console/dashboard/gallery-panel'
import { JudgingPanel } from '@/components/console/dashboard/judging-panel'
import { OverviewPanel } from '@/components/console/dashboard/overview-panel'
import { ParticipantsPanel } from '@/components/console/dashboard/participants-panel'
import { SettingsPanel } from '@/components/console/dashboard/settings-panel'
import { SideDock } from '@/components/console/dashboard/side-dock'
import { SubmissionsPanel } from '@/components/console/dashboard/submissions-panel'
import { TopDock } from '@/components/console/dashboard/top-dock'
import { VotingPanel } from '@/components/console/dashboard/voting-panel'
import { DASHBOARD_TABS, parseDashboardTab } from '@/components/console/dashboard/tabs'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Admin Dashboard | Dogfood 2026',
  description: 'Organizer admin console.',
}

interface SearchParams {
  eventId?: string
  tab?: string
}

// Admin dashboard: the top dock search selects the event that populates the
// shell below (left dock + active tab panel). Nothing renders until an event
// is picked from the search bar.
export default async function ConsolePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { eventId, tab: rawTab } = await searchParams
  const tab = parseDashboardTab(rawTab)
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  const session = await getSessionUser(token)
  if (!session) redirect('/login')

  const allEvents = await listEvents(session.user)
  const manageable = allEvents.map(serializeEvent)

  const selectedId = eventId ?? null
  let event: ReturnType<typeof serializeEvent> | null = null
  if (selectedId) {
    try {
      event = serializeEvent(await getEvent(selectedId, session.user))
    } catch (error) {
      if (error instanceof AuthError) notFound()
      throw error
    }
  }

  const role = event ? await getEffectiveRole(session.user, event.id) : null
  const canManage = role === 'SUPERADMIN' || role === 'ORGANIZER'
  const overview = event && canManage ? await getDashboardOverview(event.id) : null
  const submissionsPage =
    event && canManage && tab === 'submissions'
      ? await listDashboardSubmissionsPage(event.id, { page: 1, pageSize: 10 })
      : null

  return (
    <>
      <TopDock activeTab={tab} events={manageable} currentId={selectedId} />
      <div className="mx-auto flex max-w-5xl items-start px-0">
        <SideDock
          eventId={selectedId}
          activeTab={tab}
          user={{ name: session.user.name, email: session.user.email, role: session.user.role }}
          counts={
            overview
              ? {
                  participants: overview.totalParticipants,
                  submissions: overview.totalSubmissions,
                  judging: overview.reviewedSubmissions,
                }
              : undefined
          }
        />
        <main className="min-h-[calc(100vh-4rem-60px)] min-w-0 flex-1 px-5 py-8 md:px-10 md:py-10">
          <nav aria-label="Dashboard tabs" className="mb-6 flex gap-1 overflow-x-auto lg:hidden">
            {DASHBOARD_TABS.map((entry) => {
              const active = entry.id === tab
              return (
                <Link
                  key={entry.id}
                  href={selectedId ? `/console?eventId=${selectedId}&tab=${entry.id}` : `/console?tab=${entry.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold',
                    active
                      ? 'bg-[#16a34a]/10 text-[#16a34a] dark:text-[#22c55e]'
                      : 'bg-card text-muted-foreground',
                  )}
                >
                  <entry.icon size={16} strokeWidth={1.8} aria-hidden="true" />
                  {entry.label}
                </Link>
              )
            })}
          </nav>

          {!event || !overview ? (
            <div className="rounded-xl border border-border bg-card p-6 md:p-8">
              {!event ? (
                <>
                  <p className="text-[17px] font-bold text-foreground">Select an event to begin.</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Search all events from the top dock bar — the dashboard populates once you
                    pick one.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[17px] font-bold text-foreground">
                    You don&apos;t manage this event.
                  </p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Management is limited to the event&apos;s organizers. You can still follow it
                    on the public page.
                  </p>
                  <Link
                    href={`/hackathons/${event.slug}`}
                    className="mt-4 inline-flex h-10 items-center rounded-lg border border-border px-5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
                  >
                    View public event page
                  </Link>
                </>
              )}
            </div>
          ) : (
            <>
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                Events / <span className="text-foreground">{event.title}</span>
              </p>
              {tab === 'overview' && <OverviewPanel overview={overview} event={event} />}
              {tab === 'participants' && (
                <ParticipantsPanel eventId={event.id} rows={await listDashboardParticipants(event.id)} />
              )}
              {tab === 'submissions' && submissionsPage && (
                <SubmissionsPanel
                  eventId={event.id}
                  initialRows={submissionsPage.rows}
                  initialTotal={submissionsPage.total}
                  tracks={submissionsPage.tracks}
                />
              )}
              {tab === 'judging' && (
                <JudgingPanel
                  event={event}
                  judges={await getEventJudges(session.user, event.id)}
                  rubric={await getRubric(session.user, event.id)}
                  progress={await getAssignmentProgress(session.user, event.id)}
                  rankings={await getRankings(session.user, event.id)}
                />
              )}
              {tab === 'voting' && (
                <VotingPanel initial={await getVotingAnalytics(session.user, event.id)} />
              )}
              {tab === 'gallery' && (
                <GalleryPanel eventId={event.id} initialItems={await listDashboardGallery(event.id)} />
              )}
              {tab === 'settings' && (
                <SettingsPanel
                  event={event}
                  members={await listEventMembers(event.id)}
                  selfId={session.user.id}
                  isSuperadmin={session.user.role === 'SUPERADMIN'}
                />
              )}
            </>
          )}
        </main>
      </div>
    </>
  )
}
