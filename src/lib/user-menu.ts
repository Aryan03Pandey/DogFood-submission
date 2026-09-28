// Account dropdown visibility rules. Pure so the matrix is unit-testable;
// components/user-menu.tsx renders whatever this returns. The APIs enforce
// the same boundaries — this only keeps the menu honest.
export interface MenuItem {
  label: string
  href: string
}

export const ACCOUNT_MENU_GROUPS: MenuItem[][] = [
  [{ label: 'Edit Profile', href: '/profile' }],
  [
    { label: 'My Hackathons', href: '/hackathons' },
    { label: 'My Projects', href: '/projects' },
    { label: 'Judge Dashboard', href: '/judge' },
  ],
  [{ label: 'Organizer Dashboard', href: '/console' }],
  [{ label: 'Account Settings', href: '/settings' }],
]

export function visibleMenuGroups(
  role: string | undefined,
  managesEvents: boolean,
  judgesEvents = false,
): MenuItem[][] {
  return ACCOUNT_MENU_GROUPS.map((group) =>
    group.filter((item) => {
      // Management entry points need an organizer mapping (or SUPERADMIN).
      if (item.label === 'Organizer Dashboard') return managesEvents
      // Judge entry needs a judge mapping on at least one event.
      if (item.label === 'Judge Dashboard') return judgesEvents
      // SUPERADMINs administer events; they have no personal rows.
      if (item.label === 'My Hackathons' || item.label === 'My Projects') {
        return role !== 'SUPERADMIN'
      }
      return true
    }),
  ).filter((group) => group.length > 0)
}
