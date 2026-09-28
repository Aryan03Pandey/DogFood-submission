import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { getSessionUser } from '@/src/server/auth-service'
import LoginForm from '@/components/auth/login-form'

// Signed-in users have no business here — send them home instead of
// showing the form again.
export default async function LoginPage() {
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  if (await getSessionUser(token)) redirect('/')

  return <LoginForm />
}
