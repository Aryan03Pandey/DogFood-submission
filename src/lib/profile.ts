// Profile completeness: shared by the profile form (live meter) and any
// future surface that needs it. Required slots are first name, last name,
// and profession; email is required but always present on an account. An
// incomplete profile still saves — completeness is a signal, not a gate.
export interface ProfileCompletionInput {
  firstName: string | null
  lastName: string | null
  email: string
  countryCode: string | null
  phoneNumber: string | null
  profession: 'STUDENT' | 'PROFESSIONAL' | null
  country: string | null
  skills: readonly string[]
  projectCount: number
  linkedinUrl: string | null
  githubUrl: string | null
}

export interface ProfileCompletion {
  percent: number
  complete: boolean
  missing: string[]
}

function filled(value: string | null | undefined): boolean {
  return value != null && value.trim() !== ''
}

// Registration gate: first name, last name, and profession all present.
// Used by event registration so organizers always get a usable roster.
export function hasCompleteProfile(input: {
  firstName: string | null
  lastName: string | null
  profession: 'STUDENT' | 'PROFESSIONAL' | null
}): boolean {
  return filled(input.firstName) && filled(input.lastName) && input.profession != null
}

export function profileCompletion(input: ProfileCompletionInput): ProfileCompletion {
  const slots = [
    filled(input.firstName),
    filled(input.lastName),
    filled(input.email),
    filled(input.countryCode) && filled(input.phoneNumber),
    input.profession != null,
    filled(input.country),
    input.skills.length > 0,
    input.projectCount > 0,
    filled(input.linkedinUrl) || filled(input.githubUrl),
  ]
  const missing: string[] = []
  if (!slots[0]) missing.push('First name')
  if (!slots[1]) missing.push('Last name')
  if (!slots[4]) missing.push('Profession')
  const done = slots.filter(Boolean).length
  return {
    percent: Math.round((done / slots.length) * 100),
    complete: missing.length === 0,
    missing,
  }
}
