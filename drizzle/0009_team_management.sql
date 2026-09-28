ALTER TABLE "teams" ADD COLUMN "invite_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "one_leader_per_team" ON "team_members" USING btree ("team_id") WHERE "role" = 'LEADER';--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_min_max_ck" CHECK ("min_team_size" <= "max_team_size");
