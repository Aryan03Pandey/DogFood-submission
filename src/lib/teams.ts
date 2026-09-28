// Team roster pure logic: invite token shapes, TTL, and the roster freeze
// predicate. Reused by the team service, the manage-team page, and tests.

export const INVITE_TTL_DAYS = 7

// Canonical token form: uppercase alphanumerics, no separators. Codes are
// stored hashed in canonical form, so pasted ("df 8x2f 3j9q") and linked
// ("?token=DF-8X2F-3J9Q") input hash identically.
export function normalizeInviteToken(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Human form for air-gapped copying: DF-8X2F-3J9Q.
export function formatInviteToken(canonical: string): string {
  const clean = normalizeInviteToken(canonical)
  if (clean.length <= 2) return clean
  const head = clean.slice(0, 2)
  const rest = clean.slice(2)
  const groups: string[] = []
  for (let i = 0; i < rest.length; i += 4) groups.push(rest.slice(i, i + 4))
  return `${head}-${groups.join('-')}`
}

export function inviteExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
}

// The roster freezes (no joins/leaves/kicks/transfers/deletes) once the
// team locks on submission — or once global registration closes, whichever
// comes first. A null registration end means "not scheduled yet": open.
export function isRosterFrozen(
  input: { isLocked: boolean; registrationEnd: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (input.isLocked) return true
  if (input.registrationEnd == null) return false
  return now.getTime() >= new Date(input.registrationEnd).getTime()
}

export function isInviteExpired(
  inviteExpiresAt: Date | string | null,
  now: Date = new Date(),
): boolean {
  if (inviteExpiresAt == null) return false
  return now.getTime() >= new Date(inviteExpiresAt).getTime()
}
