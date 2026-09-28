import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { getSessionUser } from '@/src/server/auth-service'
import SignupForm from '@/components/auth/signup-form'

// Same gate as the login page: signed-in users have no business here — send
// them home instead of showing the form again.
export default async function SignupPage() {
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  if (await getSessionUser(token)) redirect('/')

  return <SignupForm />
}
