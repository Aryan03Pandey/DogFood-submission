ALTER TABLE "events" ADD COLUMN "judges_per_submission" integer DEFAULT 3 NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "double_blind_judging" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE "conflicts_of_interest" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "judge_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "coi_unique" ON "conflicts_of_interest" USING btree ("judge_id", "team_id");
--> statement-breakpoint
CREATE INDEX "coi_event_idx" ON "conflicts_of_interest" USING btree ("event_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "score_assignment_unique" ON "scores" USING btree ("assignment_id");