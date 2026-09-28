import { z } from "zod";
import {
  assignEventRoleRequestSchema,
  errorResponseSchema,
  eventRoleListResponseSchema,
  eventRoleResponseSchema,
  impersonateRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  sessionResponseSchema,
  userResponseSchema,
} from "../lib/api/schemas";
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
  method: "get" | "post";
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
    path: "/api/export.csv",
    summary: "Export event judging results as CSV",
    tags: ["judging"],
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
