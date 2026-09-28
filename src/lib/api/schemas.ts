import { z } from 'zod'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../../lib/password-rules'
import { MAX_COMMENT_BODY } from '../../../lib/comment-text'

// Shared primitives -----------------------------------------------------------

// Offline-first: accepts dotless local domains (admin@local) that strict
// RFC email validators reject, since there is no DNS or email delivery here.
export const emailSchema = z
  .string()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+$/, 'Invalid email address')
// Registration passwords must satisfy every PASSWORD_RULES entry (see
// lib/password-rules.ts, imported by the signup form so UI and server agree).
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`)
  .regex(/[a-z]/, 'Password must contain a lowercase letter.')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter.')
  .regex(/[0-9]/, 'Password must contain a number.')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character.')
export const uuidSchema = z.string().uuid()
export const roleSchema = z.enum(['SUPERADMIN', 'ORGANIZER', 'JUDGE', 'PARTICIPANT'])
export const eventRoleSchema = z.enum(['ORGANIZER', 'JUDGE', 'PARTICIPANT'])

// Requests --------------------------------------------------------------------

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  organization: z.string().max(200).optional(),
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: passwordSchema,
});

export const impersonateRequestSchema = z.object({
  email: emailSchema,
});

export const assignEventRoleRequestSchema = z.object({
  userId: uuidSchema,
  role: eventRoleSchema,
});

export const removeEventRoleRequestSchema = z.object({
  userId: uuidSchema,
});

// Password confirmation for destructive or phase-changing organizer
// actions (event delete, go-live). The password itself is never stored;
// the route verifies it against the actor's hash before proceeding.
export const passwordConfirmSchema = z.object({
  password: z.string().min(1).max(256),
});

const personNameSchema = z
  .string()
  .trim()
  .min(1, 'Required.')
  .max(100, 'Keep it under 100 characters.')
  .regex(/^[\p{L}][\p{L}\s.'-]*$/u, 'Letters, spaces, hyphens, and apostrophes only.')

const countryCodeSchema = z
  .string()
  .trim()
  .regex(/^\+\d{1,4}$/, 'Country code looks like +91.')

const phoneNumberSchema = z
  .string()
  .trim()
  .max(20, 'Keep it under 20 characters.')
  .refine(
    (value) => /^[\d\s\-()]+$/.test(value) && value.replace(/\D/g, '').length >= 4 && value.replace(/\D/g, '').length <= 15,
    'Enter a valid phone number.',
  )

const countrySchema = z
  .string()
  .trim()
  .min(1, 'Required.')
  .max(100, 'Keep it under 100 characters.')
  .regex(/^[\p{L}][\p{L}\s.'-]*$/u, 'Letters, spaces, hyphens, and apostrophes only.')

const skillSchema = z
  .string()
  .trim()
  .min(1, 'Empty skill.')
  .max(50, 'Keep a skill under 50 characters.')

const httpUrlSchema = z
  .string()
  .trim()
  .max(500, 'Keep URLs under 500 characters.')
  .refine(
    (value) => {
      try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:'
      } catch {
        return false
      }
    },
    { message: 'Enter a valid URL starting with http(s).' },
  )

function socialUrlSchema(host: string, label: string) {
  return httpUrlSchema.refine(
    (value) => {
      try {
        return new URL(value).hostname.toLowerCase().includes(host)
      } catch {
        return false
      }
    },
    { message: `Enter a valid ${label} profile URL.` },
  )
}

export const profileProjectSchema = z.object({
  title: z.string().trim().min(1, 'Project title is required.').max(120, 'Keep it under 120 characters.'),
  description: z.string().trim().max(2000, 'Keep it under 2000 characters.').nullish(),
  repoUrl: httpUrlSchema.nullish(),
  hostedUrl: httpUrlSchema.nullish(),
})

// Every field is nullable: an incomplete profile still saves, and the
// completion meter (not the API) marks what is missing.
export const profileUpdateSchema = z.object({
  firstName: personNameSchema.nullish(),
  lastName: personNameSchema.nullish(),
  countryCode: countryCodeSchema.nullish(),
  phoneNumber: phoneNumberSchema.nullish(),
  profession: z.enum(['STUDENT', 'PROFESSIONAL']).nullish(),
  country: countrySchema.nullish(),
  skills: z.array(skillSchema).max(30, 'Keep it to 30 skills.').nullish(),
  linkedinUrl: socialUrlSchema('linkedin.com', 'LinkedIn').nullish(),
  githubUrl: socialUrlSchema('github.com', 'GitHub').nullish(),
  projects: z.array(profileProjectSchema).max(20, 'Keep it to 20 projects.').nullish(),
})

export const setSubmissionHiddenSchema = z.object({
  isHidden: z.boolean(),
});

export const submissionPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  query: z.string().max(200).optional(),
  status: z.enum(["draft", "final"]).optional(),
  track: z.string().max(200).optional(),
});

// Team submissions (SUBMISSIONS.md). Drafts are created per team with a
// track, then patched as the team types; the `updatedAt` precondition keeps
// two teammates from silently overwriting each other (409 STALE_DRAFT).
const submissionUrlSchema = z
  .string()
  .trim()
  .max(500, "Links must stay under 500 characters.")
  .refine((value) => value === "" || /^https?:\/\//.test(value), {
    message: "Links must start with http:// or https://.",
  });

const techStackSchema = z
  .array(z.string().trim().min(1).max(40, "Keep each tech under 40 characters."))
  .max(20, "Keep it to 20 tech entries.");

export const createSubmissionSchema = z.object({
  trackId: uuidSchema.optional(),
});

export const updateSubmissionSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(80, "Keep it under 80 characters.").optional(),
  tagline: z.string().trim().max(140, "Keep the tagline under 140 characters.").optional(),
  description: z.string().trim().max(500, "Keep the description under 500 characters.").optional(),
  techStack: techStackSchema.optional(),
  trackId: uuidSchema.optional(),
  repoUrl: submissionUrlSchema.nullish(),
  demoUrl: submissionUrlSchema.nullish(),
  updatedAt: z.string().datetime({ message: "updatedAt must be an ISO timestamp." }),
});

export const removeAssetSchema = z.object({
  key: z.string().trim().min(1, 'Asset key is required.').max(500),
});

export type SubmissionPageQuery = z.infer<typeof submissionPageQuerySchema>;
export type CreateSubmissionRequest = z.infer<typeof createSubmissionSchema>;
export type UpdateSubmissionRequest = z.infer<typeof updateSubmissionSchema>;

// Events ----------------------------------------------------------------------

// Accepts ISO strings ("2026-05-01T10:00:00Z") and datetime-local values
// ("2026-05-01T10:00") from organizer forms; rejects unparseable input.
export const dateSchema = z.coerce
  .date()
  .refine((value) => !Number.isNaN(value.getTime()), {
    message: "Invalid date",
  });

const phaseScheduleSchema = z.object({
  registrationEnd: dateSchema,
  submissionStart: dateSchema.nullish(),
  submissionDeadline: dateSchema,
  judgingStart: dateSchema.nullish(),
  judgingEndTime: dateSchema,
  publicVotingStart: dateSchema.nullish(),
  publicVotingEndTime: dateSchema,
});

// Phase boundaries must run strictly forward in time; absent optional
// boundaries are skipped pairwise so partial schedules stay valid.
function assertIncreasingSchedule(
  value: Record<string, unknown>,
  ctx: z.RefinementCtx,
) {
  const chain = [
    "registrationEnd",
    "submissionStart",
    "submissionDeadline",
    "judgingStart",
    "judgingEndTime",
    "publicVotingStart",
    "publicVotingEndTime",
  ] as const;
  const present = chain.filter(
    (key): key is (typeof chain)[number] => value[key] instanceof Date,
  );
  for (let index = 1; index < present.length; index += 1) {
    const prev = value[present[index - 1]] as Date;
    const next = value[present[index]] as Date;
    if (next.getTime() < prev.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${present[index]} must not be before ${present[index - 1]}`,
        path: [present[index]],
      });
    }
  }
}

export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must be lowercase letters, numbers, and hyphens",
  );

export const eventFormatSchema = z.enum(["ONLINE", "OFFLINE", "HYBRID"]);
export const participationTypeSchema = z.enum(["INDIVIDUAL", "TEAM"]);
export const audienceSchema = z.enum(["STUDENT", "PROFESSIONAL", "OPEN"]);
export const prizeKindSchema = z.enum(["MONETARY", "IN_KIND", "CERTIFICATE"]);
export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code");

// Shell creation (title + slug) precedes the timeline step, so every date
// is optional here; the pairwise order check still applies to whichever
// dates are present.
const shellScheduleShape = {
  ...phaseScheduleSchema.shape,
  registrationEnd: dateSchema.nullish(),
  submissionDeadline: dateSchema.nullish(),
  judgingEndTime: dateSchema.nullish(),
  publicVotingEndTime: dateSchema.nullish(),
};

const eventDetailsShape = {
  logoUrl: z.string().url().max(500).nullish(),
  bannerUrl: z.string().url().max(500).nullish(),
  cardBannerUrl: z.string().url().max(500).nullish(),
  websiteUrl: z.string().url().max(500).nullish(),
  descriptionHtml: z.string().max(200_000).nullish(),
  format: eventFormatSchema.optional(),
  locationName: z.string().max(200).nullish(),
  locationAddress: z.string().max(500).nullish(),
  mapsUrl: z.string().url().max(500).nullish(),
  participationType: participationTypeSchema.optional(),
  minTeamSize: z.number().int().min(1).optional(),
  maxTeamSize: z.number().int().min(1).optional(),
  audience: audienceSchema.optional(),
  participationCertificate: z.boolean().optional(),
  announcementDate: dateSchema.nullish(),
  judgesPerSubmission: z.number().int().min(1).max(100).optional(),
  doubleBlindJudging: z.boolean().optional(),
  assignmentAlgorithm: z.enum(['ROUND_ROBIN', 'K_COVER']).optional(),
  normalization: z.enum(['RAW_MEAN', 'Z_SCORE', 'MIN_MAX', 'TRIMMED_MEAN']).optional(),
};

function assertTeamSizes(
  value: { minTeamSize?: number | null; maxTeamSize?: number | null },
  ctx: z.RefinementCtx,
) {
  if (
    value.minTeamSize != null &&
    value.maxTeamSize != null &&
    value.minTeamSize > value.maxTeamSize
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "minTeamSize must not exceed maxTeamSize",
      path: ["minTeamSize"],
    });
  }
}

export const createEventSchema = z
  .object({
    title: z.string().min(1).max(200),
    slug: slugSchema,
    ...shellScheduleShape,
    ...eventDetailsShape,
  })
  .superRefine((value, ctx) => {
    assertIncreasingSchedule(value, ctx);
    assertTeamSizes(value, ctx);
  });

// PATCH accepts null to clear a date: the wizard sends null for every
// unset optional boundary. partial() alone would leave null to coerce to
// the epoch (1970), which then trips the increasing-schedule check and
// returns VALIDATION_ERROR on innocent timeline saves.
const updateScheduleShape = {
  registrationEnd: dateSchema.nullish(),
  submissionStart: dateSchema.nullish(),
  submissionDeadline: dateSchema.nullish(),
  judgingStart: dateSchema.nullish(),
  judgingEndTime: dateSchema.nullish(),
  publicVotingStart: dateSchema.nullish(),
  publicVotingEndTime: dateSchema.nullish(),
};

export const updateEventSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    ...updateScheduleShape,
    ...eventDetailsShape,
  })
  .superRefine((value, ctx) => {
    assertIncreasingSchedule(value, ctx);
    assertTeamSizes(value, ctx);
  });

// Unknown rule keys pass through: old rules stay valid when new rule kinds
// appear, and validateTrackEligibility ignores what it does not know.
export const eligibilityRulesSchema = z
  .object({
    max_team_size: z.number().int().min(1).optional(),
    student_only: z.boolean().optional(),
    required_tech: z.array(z.string().min(1)).optional(),
  })
  .passthrough()
  .default({});

export const createTrackSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  eligibilityRules: eligibilityRulesSchema.optional(),
});

export const updateTrackSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullish(),
  eligibilityRules: eligibilityRulesSchema.optional(),
});

export const createPrizeSchema = z.object({
  title: z.string().min(1).max(200),
  trackId: uuidSchema.nullish(),
  cashValue: z.number().int().min(0),
  kind: prizeKindSchema.optional(),
  currency: currencySchema.optional(),
});

export const updatePrizeSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  trackId: uuidSchema.nullish(),
  cashValue: z.number().int().min(0).optional(),
  kind: prizeKindSchema.optional(),
  currency: currencySchema.optional(),
});

// Responses -------------------------------------------------------------------

export const userResponseSchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  name: z.string().nullable(),
  role: roleSchema,
  organization: z.string().nullable(),
  createdAt: z.string(),
});

export const sessionResponseSchema = z.object({
  user: userResponseSchema,
  expiresAt: z.string(),
});

export const eventRoleResponseSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  userId: uuidSchema,
  role: eventRoleSchema,
  createdAt: z.string(),
});

export const eventRoleListResponseSchema = z.object({
  eventId: uuidSchema,
  roles: z.array(eventRoleResponseSchema),
});

export const errorResponseSchema = z.object({
  error: z.string(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>
export type ImpersonateRequest = z.infer<typeof impersonateRequestSchema>
export type AssignEventRoleRequest = z.infer<typeof assignEventRoleRequestSchema>
export type RemoveEventRoleRequest = z.infer<typeof removeEventRoleRequestSchema>
export type PasswordConfirmRequest = z.infer<typeof passwordConfirmSchema>
export type ProfileUpdateRequest = z.infer<typeof profileUpdateSchema>

const teamNameSchema = z
  .string()
  .trim()
  .min(1, 'Team name is required.')
  .max(80, 'Keep it under 80 characters.')

export const createTeamSchema = z.object({ name: teamNameSchema })

export const renameTeamSchema = z.object({ name: teamNameSchema })

export const joinTeamSchema = z.object({
  token: z.string().trim().min(1, 'Enter the invite code.').max(64, 'That code is too long.'),
})

export const teamMemberSchema = z.object({ userId: uuidSchema })
export type SetSubmissionHiddenRequest = z.infer<typeof setSubmissionHiddenSchema>
export type CreateEventRequest = z.infer<typeof createEventSchema>
export type UpdateEventRequest = z.infer<typeof updateEventSchema>
export type CreateTrackRequest = z.infer<typeof createTrackSchema>
export type UpdateTrackRequest = z.infer<typeof updateTrackSchema>
export type CreatePrizeRequest = z.infer<typeof createPrizeSchema>
export type UpdatePrizeRequest = z.infer<typeof updatePrizeSchema>


export const voteAllocationSchema = z.object({
  submissionId: uuidSchema,
  votes: z.number().int().min(1).default(1),
})

export const castVoteSchema = z.object({
  submissionId: uuidSchema.optional(),
  votes: z.number().int().min(1).optional(),
  allocations: z.array(voteAllocationSchema).optional(),
  honeypot: z.string().optional(),
  formRenderedAt: z.number().optional(),
})

export const duplicateCheckSchema = z.object({
  title: z.string().min(1).max(200),
  tagline: z.string().max(200).optional(),
  description: z.string().max(10000).optional(),
})

export const commentPostSchema = z.object({
  body: z.string().min(1).max(MAX_COMMENT_BODY),
})

export const commentHideSchema = z.object({
  commentId: uuidSchema,
})