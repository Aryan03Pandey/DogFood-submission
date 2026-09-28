CREATE TYPE "public"."assignment_algorithm" AS ENUM('ROUND_ROBIN', 'K_COVER');--> statement-breakpoint
CREATE TYPE "public"."normalization" AS ENUM('RAW_MEAN', 'Z_SCORE', 'MIN_MAX', 'TRIMMED_MEAN');--> statement-breakpoint
CREATE TYPE "public"."flag_reason" AS ENUM('PLAGIARISM', 'OFF_TOPIC', 'INCOMPLETE', 'INAPPROPRIATE', 'OTHER');--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "assignment_algorithm" "assignment_algorithm" DEFAULT 'K_COVER' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "normalization" "normalization" DEFAULT 'RAW_MEAN' NOT NULL;--> statement-breakpoint
CREATE TABLE "submission_flags" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"assignment_id" uuid NOT NULL,
"judge_id" uuid NOT NULL,
"submission_id" uuid NOT NULL,
"reason" "flag_reason" NOT NULL,
"comment" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
CONSTRAINT "submission_flags_assignment_id_judge_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."judge_assignments"("id") ON DELETE cascade ON UPDATE no action,
CONSTRAINT "submission_flags_judge_id_users_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
CONSTRAINT "submission_flags_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX "flag_assignment_unique" ON "submission_flags" USING btree ("assignment_id");
