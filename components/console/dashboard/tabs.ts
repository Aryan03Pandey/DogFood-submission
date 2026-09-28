import {
  Gavel,
  Images,
  Inbox,
  LayoutDashboard,
  Settings,
  Users,
  Vote,
} from 'lucide-react'

// Admin-dashboard tabs (ADMIN-DASHBOARD.md left dock). The active tab rides
// in the URL (?tab=…) so tabs are deep-linkable and the event switcher can
// preserve context across events.
export const DASHBOARD_TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'participants', label: 'Participants', icon: Users },
  { id: 'submissions', label: 'Submissions', icon: Inbox },
  { id: 'judging', label: 'Judging', icon: Gavel },
  { id: 'voting', label: 'Voting', icon: Vote },
  { id: 'gallery', label: 'Gallery', icon: Images },
  { id: 'settings', label: 'Event Settings', icon: Settings },
] as const

export type DashboardTabId = (typeof DASHBOARD_TABS)[number]['id']

export function parseDashboardTab(value: unknown): DashboardTabId {
  return DASHBOARD_TABS.some((tab) => tab.id === value) ? (value as DashboardTabId) : 'overview'
}
