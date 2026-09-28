'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  ApiError,
  apiUpdateProfile,
  type ProfilePayload,
  type UpdateProfileInput,
} from '@/lib/api-client'
import { profileCompletion } from '@/src/lib/profile'

const SUGGESTED_SKILLS = [
  'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java',
  'React', 'Next.js', 'Node.js', 'PostgreSQL', 'Docker', 'Kubernetes',
  'AWS', 'Machine Learning', 'PyTorch', 'TensorFlow', 'GraphQL', 'REST APIs',
  'Git', 'CI/CD', 'Figma', 'Tailwind CSS', 'System Design', 'Data Structures',
]

const NAME_PATTERN = /^[\p{L}][\p{L}\s.'-]*$/u

interface ProjectDraft {
  key: string
  title: string
  description: string
  repoUrl: string
  hostedUrl: string
}

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function validUrl(value: string): boolean {
  const normalized = normalizeUrl(value)
  if (!normalized) return true
  try {
    const url = new URL(normalized)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function validHost(value: string, host: string): boolean {
  const normalized = normalizeUrl(value)
  if (!normalized) return true
  try {
    return new URL(normalized).hostname.toLowerCase().includes(host)
  } catch {
    return false
  }
}

const inputClass =
  'h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1 text-[12px] font-semibold text-destructive">
      {message}
    </p>
  )
}

function RequiredMark() {
  return (
    <span aria-hidden="true" className="font-bold text-destructive">
      {' *'}
    </span>
  )
}

// Own-profile editor. Mirrors the server zod schema client-side; the API
// stays the source of truth and its field errors land on the same inputs.
// Incomplete profiles save — the meter reports what is missing.
export function ProfileForm({ initial }: { initial: ProfilePayload }) {
  const router = useRouter()
  const [firstName, setFirstName] = useState(initial.user.firstName ?? '')
  const [lastName, setLastName] = useState(initial.user.lastName ?? '')
  const [countryCode, setCountryCode] = useState(initial.user.countryCode ?? '')
  const [phoneNumber, setPhoneNumber] = useState(initial.user.phoneNumber ?? '')
  const [profession, setProfession] = useState<'STUDENT' | 'PROFESSIONAL' | ''>(
    initial.user.profession ?? '',
  )
  const [country, setCountry] = useState(initial.user.country ?? '')
  const [skills, setSkills] = useState<string[]>(initial.user.skills)
  const [skillInput, setSkillInput] = useState('')
  const [projects, setProjects] = useState<ProjectDraft[]>(
    initial.projects.map((project, index) => ({
      key: `${project.id}-${index}`,
      title: project.title,
      description: project.description ?? '',
      repoUrl: project.repoUrl ?? '',
      hostedUrl: project.hostedUrl ?? '',
    })),
  )
  const [linkedinUrl, setLinkedinUrl] = useState(initial.user.linkedinUrl ?? '')
  const [githubUrl, setGithubUrl] = useState(initial.user.githubUrl ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const completion = useMemo(
    () =>
      profileCompletion({
        firstName,
        lastName,
        email: initial.user.email,
        countryCode,
        phoneNumber,
        profession: profession === '' ? null : profession,
        country,
        skills,
        projectCount: projects.filter((project) => project.title.trim() !== '').length,
        linkedinUrl,
        githubUrl,
      }),
    [firstName, lastName, initial.user.email, countryCode, phoneNumber, profession, country, skills, projects, linkedinUrl, githubUrl],
  )

  // Empty fields never block saving — not even required ones. An empty
  // required field only marks the profile incomplete via the meter.
  function validate(): Record<string, string> {
    const next: Record<string, string> = {}
    if (firstName.trim() !== '' && (!NAME_PATTERN.test(firstName.trim()) || firstName.trim().length > 100))
      next.firstName = 'Letters, spaces, hyphens, and apostrophes only (max 100).'
    if (lastName.trim() !== '' && (!NAME_PATTERN.test(lastName.trim()) || lastName.trim().length > 100))
      next.lastName = 'Letters, spaces, hyphens, and apostrophes only (max 100).'
    if (countryCode.trim() !== '' && !/^\+\d{1,4}$/.test(countryCode.trim()))
      next.countryCode = 'Country code looks like +91.'
    if (phoneNumber.trim() !== '') {
      const digits = phoneNumber.replace(/\D/g, '')
      if (!/^[\d\s\-()]+$/.test(phoneNumber) || digits.length < 4 || digits.length > 15)
        next.phoneNumber = 'Enter a valid phone number.'
    }
    if (country.trim() !== '' && (!NAME_PATTERN.test(country.trim()) || country.trim().length > 100))
      next.country = 'Letters, spaces, hyphens, and apostrophes only (max 100).'
    if (skills.length > 30) next.skills = 'Keep it to 30 skills.'
    if (linkedinUrl.trim() !== '' && (!validUrl(linkedinUrl) || !validHost(linkedinUrl, 'linkedin.com')))
      next.linkedinUrl = 'Enter a valid LinkedIn profile URL.'
    if (githubUrl.trim() !== '' && (!validUrl(githubUrl) || !validHost(githubUrl, 'github.com')))
      next.githubUrl = 'Enter a valid GitHub profile URL.'
    projects.forEach((project, index) => {
      const prefix = `projects.${index}` as const
      if (project.title.trim() === '') next[`${prefix}.title`] = 'Project title is required.'
      else if (project.title.trim().length > 120) next[`${prefix}.title`] = 'Keep it under 120 characters.'
      if (project.description.trim().length > 2000)
        next[`${prefix}.description`] = 'Keep it under 2000 characters.'
      if (!validUrl(project.repoUrl)) next[`${prefix}.repoUrl`] = 'Enter a valid URL starting with http(s).'
      if (!validUrl(project.hostedUrl))
        next[`${prefix}.hostedUrl`] = 'Enter a valid URL starting with http(s).'
    })
    return next
  }

  function addSkill(value: string) {
    const skill = value.trim()
    if (skill === '' || skill.length > 50) return
    if (!skills.some((entry) => entry.toLowerCase() === skill.toLowerCase())) {
      setSkills((prev) => [...prev, skill])
    }
    setSkillInput('')
  }

  function patchProject(key: string, patch: Partial<ProjectDraft>) {
    setProjects((prev) => prev.map((project) => (project.key === key ? { ...project, ...patch } : project)))
  }

  async function save() {
    if (saving) return
    const problems = validate()
    setErrors(problems)
    setBanner(null)
    if (Object.keys(problems).length > 0) {
      setBanner('Fix the highlighted fields, or clear them — empty fields are fine and save as incomplete.')
      return
    }
    const payload: UpdateProfileInput = {
      firstName: firstName.trim() === '' ? null : firstName.trim(),
      lastName: lastName.trim() === '' ? null : lastName.trim(),
      countryCode: countryCode.trim() === '' ? null : countryCode.trim(),
      phoneNumber: phoneNumber.trim() === '' ? null : phoneNumber.trim(),
      profession: profession === '' ? null : profession,
      country: country.trim() === '' ? null : country.trim(),
      skills,
      linkedinUrl: normalizeUrl(linkedinUrl),
      githubUrl: normalizeUrl(githubUrl),
      projects: projects
        .filter((project) => project.title.trim() !== '')
        .map((project) => ({
          title: project.title.trim(),
          description: project.description.trim() === '' ? null : project.description.trim(),
          repoUrl: normalizeUrl(project.repoUrl),
          hostedUrl: normalizeUrl(project.hostedUrl),
        })),
    }
    setSaving(true)
    try {
      await apiUpdateProfile(payload)
      router.push('/')
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.details) {
        const fieldErrors: Record<string, string> = {}
        for (const [field, messages] of Object.entries(err.details.fieldErrors ?? {})) {
          if (messages && messages[0]) fieldErrors[field] = messages[0]
        }
        setErrors(fieldErrors)
        const formErrors = err.details.formErrors ?? []
        setBanner(
          formErrors[0] ??
            'The server rejected some fields — they are highlighted below.',
        )
      } else {
        setBanner('Save failed. Try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  const labelClass = 'mb-1.5 block text-[13px] font-bold text-foreground'

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Profile completion" className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-bold text-foreground">Profile completion</h2>
          <p className="text-[20px] font-bold text-foreground" role="status">
            {completion.percent}%
          </p>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={completion.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Profile completion"
        >
          <div
            className="h-full rounded-full bg-[#16a34a] transition-all dark:bg-[#22c55e]"
            style={{ width: `${completion.percent}%` }}
          />
        </div>
      </section>

      {banner && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-[12px] font-semibold text-destructive">
          {banner}
        </p>
      )}
      <section aria-label="Basic details" className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-[15px] font-bold text-foreground">Basic details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="profile-first" className={labelClass}>
              First name<RequiredMark />
            </label>
            <input
              id="profile-first"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              aria-required="true"
              aria-invalid={Boolean(errors.firstName)}
              autoComplete="given-name"
              placeholder="Ada"
              className={inputClass}
            />
            <FieldError message={errors.firstName} />
          </div>
          <div>
            <label htmlFor="profile-last" className={labelClass}>
              Last name<RequiredMark />
            </label>
            <input
              id="profile-last"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              aria-required="true"
              aria-invalid={Boolean(errors.lastName)}
              autoComplete="family-name"
              placeholder="Lovelace"
              className={inputClass}
            />
            <FieldError message={errors.lastName} />
          </div>
        </div>
        <div className="mt-4">
          <label htmlFor="profile-email" className={labelClass}>
            Email<RequiredMark />
          </label>
          <input
            id="profile-email"
            value={initial.user.email}
            disabled
            aria-disabled="true"
            title="Email can't be changed"
            className={cn(inputClass, 'cursor-not-allowed opacity-60')}
          />
          <p className="mt-1 text-[12px] text-muted-foreground">Email can&apos;t be changed.</p>
        </div>
        <fieldset className="mt-4">
          <legend className={labelClass}>
            Profession<RequiredMark />
          </legend>
          <div className="flex gap-4">
            {(['STUDENT', 'PROFESSIONAL'] as const).map((option) => (
              <label
                key={option}
                className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-foreground"
              >
                <input
                  type="radio"
                  name="profession"
                  value={option}
                  checked={profession === option}
                  onChange={() => setProfession(option)}
                  aria-required="true"
                  className="size-4 accent-[#16a34a]"
                />
                {option === 'STUDENT' ? 'Student' : 'Professional'}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section aria-label="Contact and location" className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-[15px] font-bold text-foreground">Contact and location</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-[140px_1fr]">
          <div>
            <label htmlFor="profile-code" className={labelClass}>
              Country code
            </label>
            <input
              id="profile-code"
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
              aria-invalid={Boolean(errors.countryCode)}
              inputMode="tel"
              placeholder="+91"
              list="country-codes"
              className={inputClass}
            />
            <datalist id="country-codes">
              {['+1', '+44', '+91', '+61', '+81', '+49', '+33', '+65', '+971', '+27'].map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
            <FieldError message={errors.countryCode} />
          </div>
          <div>
            <label htmlFor="profile-phone" className={labelClass}>
              Contact number
            </label>
            <input
              id="profile-phone"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              aria-invalid={Boolean(errors.phoneNumber)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              className={inputClass}
            />
            <FieldError message={errors.phoneNumber} />
          </div>
        </div>
        <div className="mt-4">
          <label htmlFor="profile-country" className={labelClass}>
            Current country
          </label>
          <input
            id="profile-country"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            aria-invalid={Boolean(errors.country)}
            autoComplete="country-name"
            placeholder="India"
            className={inputClass}
          />
          <FieldError message={errors.country} />
        </div>
      </section>

      <section aria-label="Skills" className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-[15px] font-bold text-foreground">Skills</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Pick from suggestions or add your own.
        </p>
        {skills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Selected skills">
            {skills.map((skill) => (
              <span
                key={skill.toLowerCase()}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#16a34a]/10 px-3 py-1 text-[12px] font-bold text-[#16a34a] dark:text-[#22c55e]"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => setSkills((prev) => prev.filter((entry) => entry !== skill))}
                  aria-label={`Remove ${skill}`}
                  className="rounded-full hover:opacity-70"
                >
                  <X size={13} strokeWidth={2.5} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <label htmlFor="profile-skill" className="sr-only">
            Add a skill
          </label>
          <input
            id="profile-skill"
            value={skillInput}
            onChange={(event) => setSkillInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addSkill(skillInput)
              }
            }}
            placeholder="Add a skill…"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => addSkill(skillInput)}
            disabled={skillInput.trim() === ''}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            <Plus size={15} strokeWidth={2} aria-hidden="true" /> Add
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Suggested skills">
          {SUGGESTED_SKILLS.filter(
            (skill) => !skills.some((entry) => entry.toLowerCase() === skill.toLowerCase()),
          ).map((skill) => (
            <button
              key={skill}
              type="button"
              onClick={() => addSkill(skill)}
              className="rounded-full border border-border px-3 py-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-[#16a34a] hover:text-[#16a34a] dark:hover:text-[#22c55e]"
            >
              {skill}
            </button>
          ))}
        </div>
        <FieldError message={errors.skills} />
      </section>

      <section aria-label="Projects" className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold text-foreground">Projects</h2>
          <button
            type="button"
            onClick={() =>
              setProjects((prev) => [
                ...prev,
                { key: `new-${Date.now()}-${prev.length}`, title: '', description: '', repoUrl: '', hostedUrl: '' },
              ])
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            <Plus size={14} strokeWidth={2} aria-hidden="true" /> Add project
          </button>
        </div>
        {projects.length === 0 && (
          <p className="mt-3 text-[13px] text-muted-foreground">
            No projects yet — add one with a short description and links.
          </p>
        )}
        <div className="mt-4 flex flex-col gap-4">
          {projects.map((project, index) => (
            <div key={project.key} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-bold text-foreground">Project {index + 1}</p>
                <button
                  type="button"
                  onClick={() => setProjects((prev) => prev.filter((entry) => entry.key !== project.key))}
                  aria-label={`Remove project ${index + 1}`}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                >
                  <X size={15} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
              <div className="mt-3 grid gap-3">
                <div>
                  <label htmlFor={`project-title-${project.key}`} className={labelClass}>
                    Title
                  </label>
                  <input
                    id={`project-title-${project.key}`}
                    value={project.title}
                    onChange={(event) => patchProject(project.key, { title: event.target.value })}
                    aria-invalid={Boolean(errors[`projects.${index}.title`])}
                    placeholder="Glass Signal"
                    className={inputClass}
                  />
                  <FieldError message={errors[`projects.${index}.title`]} />
                </div>
                <div>
                  <label htmlFor={`project-desc-${project.key}`} className={labelClass}>
                    Short description
                  </label>
                  <textarea
                    id={`project-desc-${project.key}`}
                    value={project.description}
                    onChange={(event) => patchProject(project.key, { description: event.target.value })}
                    aria-invalid={Boolean(errors[`projects.${index}.description`])}
                    rows={2}
                    placeholder="What it does, in a line or two."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#16a34a]"
                  />
                  <FieldError message={errors[`projects.${index}.description`]} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`project-repo-${project.key}`} className={labelClass}>
                      Repo link
                    </label>
                    <input
                      id={`project-repo-${project.key}`}
                      value={project.repoUrl}
                      onChange={(event) => patchProject(project.key, { repoUrl: event.target.value })}
                      aria-invalid={Boolean(errors[`projects.${index}.repoUrl`])}
                      inputMode="url"
                      placeholder="https://github.com/…"
                      className={inputClass}
                    />
                    <FieldError message={errors[`projects.${index}.repoUrl`]} />
                  </div>
                  <div>
                    <label htmlFor={`project-hosted-${project.key}`} className={labelClass}>
                      Hosted link
                    </label>
                    <input
                      id={`project-hosted-${project.key}`}
                      value={project.hostedUrl}
                      onChange={(event) => patchProject(project.key, { hostedUrl: event.target.value })}
                      aria-invalid={Boolean(errors[`projects.${index}.hostedUrl`])}
                      inputMode="url"
                      placeholder="https://…"
                      className={inputClass}
                    />
                    <FieldError message={errors[`projects.${index}.hostedUrl`]} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Socials" className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-[15px] font-bold text-foreground">Socials</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="profile-linkedin" className={labelClass}>
              LinkedIn profile
            </label>
            <input
              id="profile-linkedin"
              value={linkedinUrl}
              onChange={(event) => setLinkedinUrl(event.target.value)}
              aria-invalid={Boolean(errors.linkedinUrl)}
              inputMode="url"
              placeholder="https://linkedin.com/in/…"
              className={inputClass}
            />
            <FieldError message={errors.linkedinUrl} />
          </div>
          <div>
            <label htmlFor="profile-github" className={labelClass}>
              GitHub profile
            </label>
            <input
              id="profile-github"
              value={githubUrl}
              onChange={(event) => setGithubUrl(event.target.value)}
              aria-invalid={Boolean(errors.githubUrl)}
              inputMode="url"
              placeholder="https://github.com/…"
              className={inputClass}
            />
            <FieldError message={errors.githubUrl} />
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex h-10 items-center rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        {!completion.complete && (
          <p className="text-[12px] text-muted-foreground">
            Saving with missing required fields keeps the profile incomplete.
          </p>
        )}
      </div>
    </div>
  )
}
