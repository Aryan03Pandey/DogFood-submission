// Active-state matching for the shared navbar. The site root only matches
// itself; section roots also match their subpages (e.g. /hackathons/[slug]
// still highlights Hackathons).
export function isActiveNavItem(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
