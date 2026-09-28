import { NextResponse } from 'next/server'
import { changePasswordRequestSchema } from '@/src/lib/api/schemas'
import { changePassword } from '@/src/server/auth-service'
import { authErrorResponse, parseBody, requireSession, routeContext } from '@/src/server/http'

// Password rotation for the signed-in viewer (Account Settings). The
// current password must prove itself; the new one must pass passwordSchema.
export async function POST(request: Request) {
  try {
    const session = await requireSession()
    const body = await parseBody(request, changePasswordRequestSchema)
    await changePassword(session.user, body.currentPassword, body.newPassword)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
