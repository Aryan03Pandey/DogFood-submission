'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'

// Reusable site footer. Follows docs/STYLE-GUIDELINES.md: flat surface with a
// hairline top border, theme tokens only, one green accent (newsletter CTA),
// every link points at a real destination — no dead links.
const columns = [
  {
    heading: 'Platform',
    links: [
      { label: 'Find a Hackathon', href: '#hackathons' },
      { label: 'Live & Upcoming Events', href: '#hackathons' },
      { label: 'Project Gallery', href: '/projects' },
      { label: 'For Organizers', href: '#organizers' },
      { label: 'Open Console', href: '/console' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Log In', href: '/login' },
      { label: 'Back to Home', href: '/' },
      { label: 'Community Stats', href: '#community' },
    ],
  },
]

function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError('Enter a valid email address.')
      return
    }
    setError(null)
    setPending(true)
    // No newsletter endpoint exists yet; confirm locally so the control
    // still does something visible instead of posting nowhere.
    setTimeout(() => {
      setPending(false)
      setDone(true)
    }, 600)
  }

  if (done) {
    return (
      <p role="status" className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-[#16a34a] dark:text-[#22c55e]">
        <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
        You&apos;re on the list. See you at the next event.
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="mt-3" noValidate>
      <label htmlFor="footer-newsletter-email" className="text-[12px] font-semibold text-foreground">
        Get event updates
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="footer-newsletter-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 shrink-0 items-center rounded-lg bg-[#16a34a] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
        >
          {pending ? 'Subscribing…' : 'Subscribe'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12px] font-semibold text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}

export default function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-12 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-[#16a34a] text-[15px] font-bold text-white">
              N
            </span>
            <span className="text-[17px] font-bold tracking-[-0.02em] text-foreground">
              NexusHack<span className="text-[#16a34a] dark:text-[#22c55e]">.</span>
            </span>
          </p>
          <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
            The platform for hackers to build the future and organizers to host seamless hackathons.
          </p>
          <NewsletterForm />
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
          <p className="text-[12px] text-muted-foreground">© 2026 NexusHack. All rights reserved.</p>
          <p className="text-[12px] text-muted-foreground">Offline-first · Built for builders.</p>
        </div>
      </div>
    </footer>
  )
}
