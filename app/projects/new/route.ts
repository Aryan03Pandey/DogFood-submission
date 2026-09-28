import { NextResponse } from 'next/server'

// Spec routes.submit = POST /projects/new. Every event on this portal is
// closed (the seeded fixture event's submissions_close is in the past, and
// the dev event has not opened yet), so submission attempts are refused
// outright with 4xx instead of hitting a missing-route 404 by accident.
export async function POST() {
  return NextResponse.json(
    {
      error: 'SUBMISSIONS_CLOSED',
      message: 'Submissions are closed for all events on this portal.',
    },
    { status: 403 },
  )
}
