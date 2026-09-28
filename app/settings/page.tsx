import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { KeyRound, Monitor, Pencil, UserRound } from 'lucide-react'

import { getSessionUser } from '@/src/server/auth-service'
import LogoutButton from '@/components/auth/logout-button'
import ThemeToggle from '@/components/theme-toggle'
import { PasswordForm } from '@/components/account/password-form'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Account Settings | Dogfood 2026',
  description: 'Manage your account, security, and appearance.',
}

// Account settings: identity summary, password rotation, appearance, and
// session sign-out. Profile field editing stays on /profile; this page is
// the account-level surface the avatar menu points at.
export default async function SettingsPage() {
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  const session = await getSessionUser(token)
  if (!session?.user) redirect('/login')
  const user = session.user

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        Account Settings
      </p>
      <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-foreground">
        Your account
      </h1>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section aria-label="Profile" className="rounded-xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-foreground">
            <UserRound size={15} strokeWidth={1.8} aria-hidden="true" className="text-muted-foreground" />
            Profile
          </h2>
          <dl className="mt-4 flex flex-col gap-3 text-[13px]">
            <div className="flex items-center justify-between gap-4">
              <dt className="font-bold text-muted-foreground">Name</dt>
              <dd className="font-semibold text-foreground">{user.name ?? '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-bold text-muted-foreground">Email</dt>
              <dd className="font-semibold text-foreground">{user.email}</dd>
            </div>
          </dl>
          <Link
            href="/profile"
            className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d]"
          >
            <Pencil size={14} strokeWidth={1.8} aria-hidden="true" /> Edit Profile
          </Link>
        </section>

        <section aria-label="Appearance" className="rounded-xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-foreground">
            <Monitor size={15} strokeWidth={1.8} aria-hidden="true" className="text-muted-foreground" />
            Appearance
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Light or dark interface. Stored in this browser.
          </p>
          <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
            <span className="text-[13px] font-semibold text-foreground">Interface theme</span>
            <ThemeToggle />
          </div>
        </section>

        <section aria-label="Security" className="rounded-xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-foreground">
            <KeyRound size={15} strokeWidth={1.8} aria-hidden="true" className="text-muted-foreground" />
            Security
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Change the password you sign in with.
          </p>
          <PasswordForm />
        </section>

        <section aria-label="Session" className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-[15px] font-bold text-foreground">Session</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Signed in as {user.email} on this device.
          </p>
          <div className="mt-4">
            <LogoutButton />
          </div>
        </section>
      </div>
    </main>
  )
}
