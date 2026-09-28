ALTER TABLE "users" ADD COLUMN "profile_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "users" SET "profile_complete" = true WHERE "first_name" IS NOT NULL AND "first_name" <> '' AND "last_name" IS NOT NULL AND "last_name" <> '' AND "profession" IS NOT NULL;
