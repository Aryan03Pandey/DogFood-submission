import { cookies } from 'next/headers'

import { getSessionUser } from '@/src/server/auth-service'
import { managesAnyEvent } from '@/src/server/event-service'
import { judgesAnyEvent } from '@/src/server/judging-service'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'

// Shared page chrome rendered by route layouts (not by individual pages).
// Access-control and signed-in behavior are unchanged: the same session
// cookie lookup feeds the navbar, organizers see management entry points,
// and signed-out visitors get the logged-out navbar. Flex column with a
// growing content wrapper keeps the body (navbar/footer excluded) at least
// viewport-tall on every page, so short pages still push the footer down.
export default async function SiteChrome({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get('dogfood_session')?.value ?? ''
  const session = await getSessionUser(token)

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar
        user={
          session ? { name: session.user.name, email: session.user.email, role: session.user.role } : null
        }
        managesEvents={session ? await managesAnyEvent(session.user) : false}
        judgesEvents={session ? await judgesAnyEvent(session.user) : false}
      />
      <div className="flex flex-1 flex-col">{children}</div>
      <Footer />
    </div>
  )
}
