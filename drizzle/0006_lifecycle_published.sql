ALTER TABLE "events" DROP COLUMN "start_time";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "registration_start";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "end_date";--> statement-breakpoint
-- New terminal lifecycle state. No backfill here on purpose: Postgres
-- cannot use a freshly added enum value in the same transaction, and
-- stored ARCHIVED rows need none — deriveEventStatus ignores the stored
-- flag except for DRAFT, so legacy rows derive PUBLISHED on their own.
ALTER TYPE "public"."event_status" ADD VALUE 'PUBLISHED';
