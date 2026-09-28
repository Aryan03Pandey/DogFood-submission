import { NextResponse } from 'next/server'
import { profileUpdateSchema } from '@/src/lib/api/schemas'
import { getProfile, updateProfile } from '@/src/server/profile-service'
import {
  authErrorResponse,
  parseBody,
  requireSession,
  routeContext,
} from '@/src/server/http'

// Own profile: read everything the profile form needs (never credentials),
// or PATCH a partial update. Every field stays nullable — an incomplete
// profile saves fine; completeness is reported, not enforced.
export async function GET(request: Request) {
  try {
    const session = await requireSession()
    return NextResponse.json(await getProfile(session.user.id))
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSession()
    const body = await parseBody(request, profileUpdateSchema)
    return NextResponse.json(
      await updateProfile(session.user, {
        firstName: body.firstName,
        lastName: body.lastName,
        countryCode: body.countryCode,
        phoneNumber: body.phoneNumber,
        profession: body.profession,
        country: body.country,
        skills: body.skills,
        linkedinUrl: body.linkedinUrl,
        githubUrl: body.githubUrl,
        projects: body.projects,
      }),
    )
  } catch (error) {
    return authErrorResponse(error, routeContext(request))
  }
}
