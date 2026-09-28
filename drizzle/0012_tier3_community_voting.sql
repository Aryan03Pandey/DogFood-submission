ALTER TABLE "events" ADD COLUMN "voting_type" text DEFAULT 'SINGLE_CHOICE' NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "blind_voting" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "quadratic_credits" integer DEFAULT 100 NOT NULL;