import type { DashboardTabId } from '@/components/console/dashboard/tabs'
import { EventSwitcher } from '@/components/console/dashboard/event-switcher'

// Top dock: fixed-height bar under the navbar carrying the centered event
// search. Selecting an event here populates the dashboard below; sticky so
// the context survives long tables.
export function TopDock({
  activeTab,
  events,
  currentId,
}: {
  activeTab: DashboardTabId
  events: Array<{ id: string; title: string; slug: string; status: string }>
  currentId: string | null
}) {
  return (
    <div className="sticky top-16 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-[60px] max-w-5xl items-center justify-center px-5">
        <div className="w-full max-w-md">
          <EventSwitcher events={events} currentId={currentId} currentTab={activeTab} />
        </div>
      </div>
    </div>
  )
}
