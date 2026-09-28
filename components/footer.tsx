import Link from 'next/link'

// Reusable site footer. Fully token-driven (bg-card, muted-foreground,
// border): it follows the global light/dark theme with no hardcoded surface
// or text colors, so one token change in globals.css recolors it. Cyan
// divider plus green brand accent are theme-agnostic marks. Every link
// points at a real destination — no dead links.
const columns = [
  {
    heading: 'Platform',
    links: [
      { label: 'Find a Hackathon', href: '#hackathons' },
      { label: 'Live & Upcoming Events', href: '#hackathons' },
      { label: 'Project Gallery', href: '/projects' },
      { label: 'API Docs', href: '/api/docs' },
      { label: 'Verify a signed file', href: '/verify' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Log In', href: '/login' },
      { label: 'Back to Home', href: '/' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="border-t border-border bg-card text-card-foreground">
      <div className="h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" aria-hidden="true" />
      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-12 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#2f7bff] to-fuchsia-500 text-[15px] font-bold text-white shadow-[0_0_14px_rgba(47,123,255,0.5)]">
              R
            </span>
            <span className="text-[17px] font-bold tracking-[-0.02em] text-foreground">
              RaptorHack<span className="text-green-500">.</span>
            </span>
          </p>
          <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
            The platform for hackers to build the future and organizers to host seamless hackathons.
          </p>
        </div>
        {columns.map((column) => (
          <nav key={column.heading} aria-label={column.heading}>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              {column.heading}
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-1 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-muted-foreground">© 2026 RaptorHack. All rights reserved.</p>
          <p className="text-[12px] text-muted-foreground">Offline-first · Built for builders.</p>
        </div>
      </div>
    </footer>
  )
}
