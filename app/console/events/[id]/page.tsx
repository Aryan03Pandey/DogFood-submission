import { redirect } from 'next/navigation'

interface Params {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

// The dashboard moved to /console (event comes from the top-dock search).
// This route stays as a redirect so old links keep working.
export default async function ConsoleEventRedirect({ params, searchParams }: Params) {
  const { id } = await params
  const { tab } = await searchParams
  redirect(tab ? `/console?eventId=${id}&tab=${tab}` : `/console?eventId=${id}`)
}
