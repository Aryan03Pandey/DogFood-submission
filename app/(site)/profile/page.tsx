import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { getSessionUser } from '@/src/server/auth-service'
import { getProfile } from '@/src/server/profile-service'
import { ProfileForm } from '@/components/profile/profile-form'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Edit Profile | Dogfood 2026',
  description: 'View and edit your profile.',
}

// Own profile: the layout owns navbar/footer; the form owns every field.
// Signed-out visitors sign in first.
export default async function ProfilePage() {
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  const session = await getSessionUser(token)
  if (!session) redirect('/login')
  const profile = await getProfile(session.user.id)

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        Account
      </p>
      <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-foreground">Edit profile</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        Fields marked <span aria-hidden="true" className="font-bold text-destructive">*</span> are
        required for a complete profile — but an incomplete profile saves just fine.
      </p>
      <div className="mt-6">
        <ProfileForm initial={profile} />
      </div>
    </main>
  )
}
