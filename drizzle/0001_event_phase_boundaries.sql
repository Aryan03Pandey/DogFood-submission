ALTER TABLE "events" ADD COLUMN "registration_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "judging_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "public_voting_start" timestamp with time zone;
