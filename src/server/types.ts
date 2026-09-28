import type { DbUser, EventRole, UserRole } from '../db/schema'

// Shared server-side contracts for the auth layer. Controllers (API routes),
// services (auth-service), and HTTP helpers all import types from here so
// shapes stay consistent without circular imports.

export interface CreateUserInput {
  email: string
  password: string
  role?: UserRole
  organization?: string
}

export interface IssuedSession {
  token: string
  expiresAt: Date
}

export interface SessionUser {
  user: DbUser
  expiresAt: Date
}

export interface AssignEventRoleInput {
  actor: DbUser
  eventId: string
  targetUserId: string
  role: EventRole
}
