CREATE TYPE "public"."event_format" AS ENUM('ONLINE', 'OFFLINE', 'HYBRID');--> statement-breakpoint
CREATE TYPE "public"."participation_type" AS ENUM('INDIVIDUAL', 'TEAM');--> statement-breakpoint
CREATE TYPE "public"."audience" AS ENUM('STUDENT', 'PROFESSIONAL', 'OPEN');--> statement-breakpoint
CREATE TYPE "public"."prize_kind" AS ENUM('MONETARY', 'IN_KIND', 'CERTIFICATE');--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "start_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "submission_deadline" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "judging_end_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "public_voting_end_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "announcement_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "end_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "banner_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "card_banner_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "description_html" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "format" "event_format" DEFAULT 'ONLINE' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "location_name" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "location_address" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "maps_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "participation_type" "participation_type" DEFAULT 'TEAM' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "min_team_size" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "max_team_size" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "audience" "audience" DEFAULT 'OPEN' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "participation_certificate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "prizes" ADD COLUMN "kind" "prize_kind" DEFAULT 'MONETARY' NOT NULL;--> statement-breakpoint
ALTER TABLE "prizes" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;
