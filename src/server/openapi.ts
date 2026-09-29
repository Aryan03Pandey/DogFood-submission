import { z } from "zod";
import {
  assignEventRoleRequestSchema,
  createTokenRequestSchema,
  errorResponseSchema,
  eventRoleListResponseSchema,
  eventRoleResponseSchema,
  impersonateRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  sessionResponseSchema,
  tokenCreatedResponseSchema,
  tokenListResponseSchema,
  userResponseSchema,
} from "../lib/api/schemas";
import { exportEnvelopeSchema, signedExportEnvelopeSchema } from "../lib/api/export-schema";
import {
  signedJudgeRecordEnvelopeSchema,
  signedResultsManifestEnvelopeSchema,
} from "../lib/api/records-schema";
import { awardPrizeRequestSchema } from "../lib/api/certificate-schema";
import { registerWebhookRequestSchema } from "../lib/api/webhook-schema";
import {
  assignmentGenerationSchema,
  conflictSchema,
  judgeInviteSchema,
  judgeTracksSchema,
  pairwiseSchema,
  rubricSchema,
  scoreSchema,
} from "../lib/api/judging-schemas";

// Minimal Zod -> JSON Schema converter covering the shapes used by this API. ---

type JsonSchema = Record<string, unknown>;

function checkStringFormat(
  checks: Array<{ kind: string }>,
): string | undefined {
  for (const check of checks) {
    if (check.kind === "email") return "email";
    if (check.kind === "uuid") return "uuid";
    if (check.kind === "url") return "uri";
  }
  return undefined;
}

export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const def = (schema as unknown as { _def: Record<string, any> })._def;
  switch (def.typeName as string) {
    case "ZodString": {
      const out: JsonSchema = { type: "string" };
      const format = checkStringFormat(def.checks ?? []);
      if (format) out.format = format;
      for (const check of def.checks ?? []) {
        if (check.kind === "min") out.minLength = check.value;
        if (check.kind === "max") out.maxLength = check.value;
      }
      return out;
    }
    case "ZodNumber":
      return {
        type: def.checks?.some((c: { kind: string }) => c.kind === "int")
          ? "integer"
          : "number",
      };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum":
      return { type: "string", enum: def.values };
    case "ZodLiteral":
      return { type: typeof def.const, enum: [def.const] };
    case "ZodArray":
      return { type: "array", items: zodToJsonSchema(def.type) };
    case "ZodObject": {
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, child] of Object.entries<z.ZodTypeAny>(def.shape())) {
        const childDef = (child as unknown as { _def: Record<string, any> })
          ._def;
        const optional =
          childDef.typeName === "ZodOptional" ||
          childDef.typeName === "ZodDefault";
        properties[key] = zodToJsonSchema(
          optional ? childDef.innerType : child,
        );
        if (!optional) required.push(key);
      }
      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      };
    }
    case "ZodOptional":
    case "ZodDefault":
      return zodToJsonSchema(def.innerType);
    case "ZodNullable": {
      const inner = zodToJsonSchema(def.innerType);
      return { ...inner, nullable: true };
    }
    default:
      return {};
  }
}

// Route registry: the single source of truth for routes + OpenAPI. -------------

export interface ApiRoute {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  summary: string;
  tags: string[];
  auth: boolean;
  body?: z.ZodTypeAny;
  response: z.ZodTypeAny;
}

export const apiRoutes: ApiRoute[] = [
  {
    method: "get",
    path: "/api/health",
    summary: "Health check",
    tags: ["system"],
    auth: false,
    response: z.object({
      status: z.string(),
      service: z.string(),
      offline: z.boolean(),
      timestamp: z.string(),
    }),
  },
  {
    method: "post",
    path: "/api/auth/register",
    summary: "Register a participant account",
    tags: ["auth"],
    auth: false,
    body: registerRequestSchema,
    response: userResponseSchema,
  },
  {
    method: "post",
    path: "/api/auth/login",
    summary: "Log in with email and password",
    tags: ["auth"],
    auth: false,
    body: loginRequestSchema,
    response: sessionResponseSchema,
  },
  {
    method: "post",
    path: "/api/auth/logout",
    summary: "Revoke the current session",
    tags: ["auth"],
    auth: true,
    response: z.object({ ok: z.boolean() }),
  },
  {
    method: "get",
    path: "/api/auth/me",
    summary: "Get the current session user",
    tags: ["auth"],
    auth: true,
    response: sessionResponseSchema,
  },
  {
    method: "post",
    path: "/api/auth/impersonate",
    summary: "Offline dev only: mint a session for a seeded user",
    tags: ["auth"],
    auth: false,
    body: impersonateRequestSchema,
    response: sessionResponseSchema,
  },
  {
    method: "get",
    path: "/api/events/{id}/roles",
    summary: "List event-contextual role assignments",
    tags: ["roles"],
    auth: true,
    response: eventRoleListResponseSchema,
  },
  {
    method: "post",
    path: "/api/events/{id}/roles",
    summary: "Assign an event-contextual role (organizer or superadmin)",
    tags: ["roles"],
    auth: true,
    body: assignEventRoleRequestSchema,
    response: eventRoleResponseSchema,
  },
  {
    method: "get",
    path: "/api/openapi.json",
    summary: "This OpenAPI 3.0 spec, as JSON",
    tags: ["system"],
    auth: false,
    response: z.object({}),
  },
  {
    method: "get",
    path: "/api/keys",
    summary: "List public signing keys (JWKS-like)",
    tags: ["signing"],
    auth: false,
    response: z.object({
      keys: z.array(
        z.object({
          kid: z.string(),
          publicKeyPem: z.string(),
          createdAt: z.string(),
          retiredAt: z.string().nullable(),
          status: z.enum(["active", "retired"]),
        }),
      ),
    }),
  },
  {
    method: "post",
    path: "/api/verify",
    summary:
      "Verify a signed envelope (results manifest, judge record, certificate, export)",
    tags: ["signing"],
    auth: false,
    body: z.object({}),
    response: z.object({
      valid: z.boolean(),
      kid: z.string().optional(),
      type: z.string().optional(),
      reason: z.string().optional(),
    }),
  },
  {
    method: "get",
    path: "/api/events/{id}/export.json",
    summary:
      "Export one event (and everything referencing it) as a JSON envelope",
    tags: ["export"],
    auth: true,
    response: signedExportEnvelopeSchema,
  },
  {
    method: "post",
    path: "/api/admin/import",
    summary: "Restore a signed export/backup envelope (SUPERADMIN only) — a legacy unsigned envelope is still accepted",
    tags: ["export"],
    auth: true,
    body: signedExportEnvelopeSchema,
    response: z.object({
      dryRun: z.boolean(),
      counts: z.record(z.string(), z.number()),
      placeholderPasswordUserIds: z.array(z.string()),
    }),
  },
  {
    method: "post",
    path: "/api/tokens",
    summary: "Create an API token (Bearer dfk_...) for the current user",
    tags: ["tokens"],
    auth: true,
    body: createTokenRequestSchema,
    response: tokenCreatedResponseSchema,
  },
  {
    method: "get",
    path: "/api/tokens",
    summary:
      "List the current user's API tokens (name, prefix, dates — never the hash)",
    tags: ["tokens"],
    auth: true,
    response: tokenListResponseSchema,
  },
  {
    method: "delete",
    path: "/api/tokens/{id}",
    summary: "Revoke an API token",
    tags: ["tokens"],
    auth: true,
    response: z.object({ ok: z.boolean() }),
  },
  {
    method: "get",
    path: "/api/judge/queue",
    summary: "List the current judge assignment queue",
    tags: ["judging"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/judge/submissions/{id}",
    summary: "Get an assigned submission and rubric",
    tags: ["judging"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/judge/scores",
    summary: "List the caller's scores or organizer-authorized judge scores",
    tags: ["judging"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/judge/scores",
    summary: "Create or update a score for an owned assignment",
    tags: ["judging"],
    auth: true,
    body: scoreSchema,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/judge/pairwise",
    summary: "Submit an assigned pairwise comparison",
    tags: ["judging"],
    auth: true,
    body: pairwiseSchema,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/organizer/judges",
    summary: "Grant a user the judge role for an event",
    tags: ["judging"],
    auth: true,
    body: judgeInviteSchema,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/organizer/judges/{id}/tracks",
    summary: "Set a judge’s qualified event tracks",
    tags: ["judging"],
    auth: true,
    body: judgeTracksSchema,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/organizer/coi",
    summary: "Add a manual conflict of interest",
    tags: ["judging"],
    auth: true,
    body: conflictSchema,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/organizer/rubrics",
    summary: "Create or update an event rubric",
    tags: ["judging"],
    auth: true,
    body: rubricSchema,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/organizer/assignments/generate",
    summary: "Generate load-balanced k-cover assignments",
    tags: ["judging"],
    auth: true,
    body: assignmentGenerationSchema,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/organizer/assignments/progress",
    summary: "Get judge assignment completion counts",
    tags: ["judging"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/organizer/rankings",
    summary: "Get raw and normalized judging rankings",
    tags: ["judging"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/organizer/rankings/pairwise",
    summary: "Get Bradley-Terry ranking estimates",
    tags: ["judging"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/judge/records",
    summary:
      "Get a signed, aggregate-only judge participation record (assigned/completed counts, no scores) — ?eventId=&judge=",
    tags: ["signing"],
    auth: true,
    response: signedJudgeRecordEnvelopeSchema,
  },
  {
    method: "get",
    path: "/api/events/{id}/results-manifest.json",
    summary:
      "Get the signed, public results manifest (rankings + vote totals) once results are PUBLISHED",
    tags: ["signing"],
    auth: false,
    response: signedResultsManifestEnvelopeSchema,
  },
  {
    method: "get",
    path: "/api/events/{id}/certificates/participant/{submissionId}",
    summary:
      "Download a signed participant certificate PDF (?format=json for the envelope, ?user= for organizer oversight)",
    tags: ["signing"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/certificates/winner/{prizeAwardId}",
    summary: "Download a signed winner certificate PDF (same ?format=/?user= shape)",
    tags: ["signing"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/prize-awards",
    summary: "List an event's recorded prize winners (organizer only)",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/prize-awards",
    summary: "Record a submission as the winner of a prize (organizer only)",
    tags: ["events"],
    auth: true,
    body: awardPrizeRequestSchema,
    response: z.any(),
  },
  {
    method: "delete",
    path: "/api/events/{id}/prize-awards/{awardId}",
    summary: "Revoke a recorded prize award (organizer only)",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/webhooks",
    summary: "List an event's registered webhook endpoints (organizer only, never returns the secret)",
    tags: ["webhooks"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/webhooks",
    summary:
      "Register a webhook endpoint for submission.created/judging.completed/results.published (organizer only; secret shown once)",
    tags: ["webhooks"],
    auth: true,
    body: registerWebhookRequestSchema,
    response: z.any(),
  },
  {
    method: "delete",
    path: "/api/events/{id}/webhooks/{webhookId}",
    summary: "Revoke a webhook endpoint (organizer only)",
    tags: ["webhooks"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/webhooks/{webhookId}/test",
    summary: "Enqueue a one-off webhook.test delivery to this endpoint (organizer only)",
    tags: ["webhooks"],
    auth: true,
    response: z.any(),
  },
  // Event/team/submission/profile CRUD (event-creation, team-formation,
  // profile features) — registered here for coverage completeness
  // (tests/acceptance/t4-openapi-coverage.test.ts); response: z.any() is a
  // quick stub, same as this file's own judging-route entries above, since
  // fully modeling each response shape belongs to whoever owns those routes.
  {
    method: "get",
    path: "/api/events",
    summary: "List events",
    tags: ["events"],
    auth: false,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events",
    summary: "Create an event shell",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}",
    summary: "Get an event",
    tags: ["events"],
    auth: false,
    response: z.any(),
  },
  {
    method: "patch",
    path: "/api/events/{id}",
    summary: "Update an event",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "delete",
    path: "/api/events/{id}",
    summary: "Delete an event",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/dashboard",
    summary: "Get the organizer dashboard summary for an event",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/gallery-items",
    summary: "List an event's public gallery items",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/participants",
    summary: "List an event's registered participants",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/participants/export",
    summary: "Export an event's participants as CSV",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/prizes",
    summary: "List an event's prizes",
    tags: ["events"],
    auth: false,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/prizes",
    summary: "Create a prize",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "patch",
    path: "/api/events/{id}/prizes/{prizeId}",
    summary: "Update a prize",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "delete",
    path: "/api/events/{id}/prizes/{prizeId}",
    summary: "Delete a prize",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/publish",
    summary: "Publish an event (leave DRAFT)",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/register",
    summary: "Register the current user for an event",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "delete",
    path: "/api/events/{id}/register",
    summary: "Unregister the current user from an event",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "delete",
    path: "/api/events/{id}/roles",
    summary: "Revoke an event-contextual role assignment",
    tags: ["roles"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/submissions",
    summary: "List an event's submissions",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/submissions/export",
    summary: "Export an event's submissions as CSV",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "patch",
    path: "/api/events/{id}/submissions/{submissionId}",
    summary: "Update a submission",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/submissions/{submissionId}/submit",
    summary: "Submit a draft submission",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/teams",
    summary: "List an event's teams",
    tags: ["teams"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/teams",
    summary: "Create a team",
    tags: ["teams"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/teams/join",
    summary: "Join a team via invite token",
    tags: ["teams"],
    auth: true,
    response: z.any(),
  },
  {
    method: "patch",
    path: "/api/events/{id}/teams/{teamId}",
    summary: "Update a team",
    tags: ["teams"],
    auth: true,
    response: z.any(),
  },
  {
    method: "delete",
    path: "/api/events/{id}/teams/{teamId}",
    summary: "Delete a team",
    tags: ["teams"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/teams/{teamId}/kick",
    summary: "Remove a member from a team",
    tags: ["teams"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/teams/{teamId}/leave",
    summary: "Leave a team",
    tags: ["teams"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/teams/{teamId}/submit",
    summary: "Submit a team's project",
    tags: ["teams"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/teams/{teamId}/token",
    summary: "Regenerate a team's invite token",
    tags: ["teams"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/teams/{teamId}/transfer",
    summary: "Transfer team leadership",
    tags: ["teams"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/tracks",
    summary: "List an event's tracks",
    tags: ["events"],
    auth: false,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/tracks",
    summary: "Create a track",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "patch",
    path: "/api/events/{id}/tracks/{trackId}",
    summary: "Update a track",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "delete",
    path: "/api/events/{id}/tracks/{trackId}",
    summary: "Delete a track",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/profile",
    summary: "Get the current user's profile",
    tags: ["profile"],
    auth: true,
    response: z.any(),
  },
  {
    method: "patch",
    path: "/api/profile",
    summary: "Update the current user's profile",
    tags: ["profile"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/upload",
    summary: "Upload a file (image/asset)",
    tags: ["upload"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/users",
    summary: "List users (admin)",
    tags: ["users"],
    auth: true,
    response: z.any(),
  },
  {
    method: "patch",
    path: "/api/users",
    summary: "Update a user (admin)",
    tags: ["users"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/export.csv",
    summary: "Export event judging results as CSV",
    tags: ["judging"],
    auth: true,
    response: z.string(),
  },
  {
    method: "get",
    path: "/api/files/{...path}",
    summary: "Stream a filer-stored asset same-origin (public)",
    tags: ["upload"],
    auth: false,
    response: z.any(),
  },
  // Tier 3 (voting/engagement, submission pipeline) + audit-log/duplicate-
  // detection routes merged in from master after T2/T3 landed — same
  // coverage-completeness stub pattern (z.any()) as the block above.
  {
    method: "get",
    path: "/api/events/{id}/audit-logs",
    summary: "List an event's audit log entries (organizer only)",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/duplicates",
    summary: "Detect likely-duplicate submissions for an event (organizer only)",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/submissions",
    summary: "Create a draft submission for the caller's team",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/submissions/mine",
    summary: "Get the caller's own submission for an event",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "delete",
    path: "/api/events/{id}/submissions/{submissionId}",
    summary: "Delete a draft submission",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/submissions/{submissionId}/assets",
    summary: "Upload a submission asset (multipart)",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "delete",
    path: "/api/events/{id}/submissions/{submissionId}/assets",
    summary: "Remove a submission asset",
    tags: ["events"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/submissions/{submissionId}/comments",
    summary: "List public comments on a finalized submission",
    tags: ["voting"],
    auth: false,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/submissions/{submissionId}/comments",
    summary: "Post a comment on a finalized submission",
    tags: ["voting"],
    auth: true,
    response: z.any(),
  },
  {
    method: "delete",
    path: "/api/events/{id}/submissions/{submissionId}/comments",
    summary: "Remove a comment (author or organizer)",
    tags: ["voting"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/voting-items",
    summary: "List an event's public-voting-round submissions",
    tags: ["voting"],
    auth: false,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/votes",
    summary: "Get public voting results/leaderboard for an event",
    tags: ["voting"],
    auth: false,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/events/{id}/vote",
    summary: "Cast a public vote (voter-fingerprint scoped, anti-abuse rate limited)",
    tags: ["voting"],
    auth: false,
    response: z.any(),
  },
  {
    method: "delete",
    path: "/api/events/{id}/vote",
    summary: "Retract a public vote",
    tags: ["voting"],
    auth: false,
    response: z.any(),
  },
  {
    method: "delete",
    path: "/api/judge/scores",
    summary: "Delete a score for an owned assignment",
    tags: ["judging"],
    auth: true,
    response: z.any(),
  },
  {
    method: "post",
    path: "/api/judge/flags",
    summary: "Flag a submission for organizer review (conflict/concern)",
    tags: ["judging"],
    auth: true,
    response: z.any(),
  },
  {
    method: "delete",
    path: "/api/judge/flags",
    summary: "Remove a judge's own flag",
    tags: ["judging"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/organizer/judges",
    summary: "List an event's judges",
    tags: ["judging"],
    auth: true,
    response: z.any(),
  },
  {
    method: "delete",
    path: "/api/organizer/judges",
    summary: "Revoke a user's judge role for an event",
    tags: ["judging"],
    auth: true,
    response: z.any(),
  },
  // Master-side routes added after the branch forked — same
  // coverage-completeness stub pattern (100% documented endpoints).
  {
    method: "post",
    path: "/api/auth/password",
    summary: "Change the caller's password",
    tags: ["auth"],
    auth: true,
    response: z.any(),
  },
  {
    method: "get",
    path: "/api/events/{id}/export",
    summary: "Export an event as CSV (organizer only)",
    tags: ["events"],
    auth: true,
    response: z.string(),
  },
];

export function buildOpenApiSpec() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of apiRoutes) {
    const operation: Record<string, unknown> = {
      summary: route.summary,
      tags: route.tags,
      responses: {
        "200": {
          description: "Success",
          content: {
            "application/json": { schema: zodToJsonSchema(route.response) },
          },
        },
        "400": {
          description: "Validation error",
          content: {
            "application/json": {
              schema: zodToJsonSchema(errorResponseSchema),
            },
          },
        },
        ...(route.auth
          ? { "401": { description: "Missing or expired session" } }
          : {}),
      },
    };
    if (route.body) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": { schema: zodToJsonSchema(route.body) },
        },
      };
    }
    if (route.auth) operation.security = [{ sessionCookie: [] }];
    paths[route.path] = {
      ...(paths[route.path] ?? {}),
      [route.method]: operation,
    };
  }
  return {
    openapi: "3.0.3",
    info: { title: "Dogfood 2026 API", version: "1.0.0" },
    servers: [{ url: "http://localhost:3000" }],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "dogfood_session",
        },
      },
    },
    paths,
  };
}
