// Password rules shared by the register API schema and the signup form.
//
// The signup UI imports the patterns and the strength evaluator from here so
// the checklist/meter can never drift from what the server enforces. This
// module has no dependencies, so it is safe to import from client components.

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export interface PasswordRule {
  id: 'length' | 'lowercase' | 'uppercase' | 'digit' | 'special'
  label: string
  test: (password: string) => boolean
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${PASSWORD_MIN_LENGTH} characters (max ${PASSWORD_MAX_LENGTH})`,
    test: (password) => password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
  },
  { id: 'lowercase', label: 'One lowercase letter (a–z)', test: (password) => /[a-z]/.test(password) },
  { id: 'uppercase', label: 'One uppercase letter (A–Z)', test: (password) => /[A-Z]/.test(password) },
  { id: 'digit', label: 'One number (0–9)', test: (password) => /[0-9]/.test(password) },
  {
    id: 'special',
    label: 'One special character (!, @, #, …)',
    test: (password) => /[^A-Za-z0-9]/.test(password),
  },
]

export type PasswordStrength = 'Weak' | 'Medium' | 'Strong'

export function unmetPasswordRules(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password))
}

// Strength is progress toward the full rule set: 0–2 rules met reads Weak,
// 3–4 Medium, all 5 Strong. Signup requires Strong (every rule passes).
export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (password.length === 0) return 'Weak'
  const met = PASSWORD_RULES.length - unmetPasswordRules(password).length
  if (met >= PASSWORD_RULES.length) return 'Strong'
  return met >= 3 ? 'Medium' : 'Weak'
}
