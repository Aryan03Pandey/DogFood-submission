import { eq } from 'drizzle-orm'
import { db } from '../db'
import {
  userProjects,
  users,
  type DbUser,
  type DbUserProject,
} from '../db/schema'
import type { ProfileUpdateRequest } from '../lib/api/schemas'

export interface ProfileProjectInput {
  title: string
  description?: string | null
  repoUrl?: string | null
  hostedUrl?: string | null
}

export interface UpdateProfileInput extends Omit<ProfileUpdateRequest, 'projects' | 'skills'> {
  skills?: string[] | null
  projects?: ProfileProjectInput[] | null
}

export interface ProfilePayload {
  user: Omit<DbUser, 'passwordHash'>
  projects: DbUserProject[]
}

function serializeUser(row: DbUser): Omit<DbUser, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...rest } = row
  return rest
}

function emptyToNull(value: string | null | undefined): string | null {
  return value == null || value.trim() === '' ? null : value.trim()
}

// Own-profile read: everything the profile form needs, never credentials.
export async function getProfile(userId: string): Promise<ProfilePayload> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!row) throw new Error('USER_NOT_FOUND')
  const projects = await db.select().from(userProjects).where(eq(userProjects.userId, userId))
  return { user: serializeUser(row), projects }
}

// Own-profile write. Every field stays nullable so an incomplete profile
// saves fine; the completion meter (not this service) reports what is
// missing. Projects are replaced wholesale: the form owns the whole list.
// Display name follows first + last for existing surfaces (navbar, tables).
export async function updateProfile(actor: DbUser, input: UpdateProfileInput): Promise<ProfilePayload> {
  const firstName = input.firstName !== undefined ? emptyToNull(input.firstName) : undefined
  const lastName = input.lastName !== undefined ? emptyToNull(input.lastName) : undefined
  const skills =
    input.skills !== undefined && input.skills !== null
      ? [...new Set(input.skills.map((skill) => skill.trim()).filter((skill) => skill !== ''))]
      : undefined

  const updated = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(users).where(eq(users.id, actor.id)).limit(1)
    const nextFirst = firstName !== undefined ? firstName : (current?.firstName ?? null)
    const nextLast = lastName !== undefined ? lastName : (current?.lastName ?? null)
    const nextProfession =
      input.profession !== undefined ? input.profession : (current?.profession ?? null)
    const patch: Partial<DbUser> = {
      profileComplete: nextFirst != null && nextLast != null && nextProfession != null,
      ...(firstName !== undefined ? { firstName } : {}),
      ...(lastName !== undefined ? { lastName } : {}),
      ...(input.countryCode !== undefined ? { countryCode: emptyToNull(input.countryCode) } : {}),
      ...(input.phoneNumber !== undefined ? { phoneNumber: emptyToNull(input.phoneNumber) } : {}),
      ...(input.profession !== undefined ? { profession: input.profession } : {}),
      ...(input.country !== undefined ? { country: emptyToNull(input.country) } : {}),
      ...(skills !== undefined ? { skills } : {}),
      ...(input.linkedinUrl !== undefined ? { linkedinUrl: emptyToNull(input.linkedinUrl) } : {}),
      ...(input.githubUrl !== undefined ? { githubUrl: emptyToNull(input.githubUrl) } : {}),
    }
    if (firstName !== undefined || lastName !== undefined) {
      patch.name = nextFirst || nextLast ? `${nextFirst ?? ''} ${nextLast ?? ''}`.trim() : null
    }
    const [row] = await tx.update(users).set(patch).where(eq(users.id, actor.id)).returning()
    if (input.projects !== undefined && input.projects !== null) {
      await tx.delete(userProjects).where(eq(userProjects.userId, actor.id))
      for (const project of input.projects) {
        await tx.insert(userProjects).values({
          userId: actor.id,
          title: project.title.trim(),
          description: emptyToNull(project.description),
          repoUrl: emptyToNull(project.repoUrl),
          hostedUrl: emptyToNull(project.hostedUrl),
        })
      }
    }
    return row
  })
  if (!updated) throw new Error('USER_NOT_FOUND')
  const projects = await db.select().from(userProjects).where(eq(userProjects.userId, actor.id))
  return { user: serializeUser(updated), projects }
}
