ALTER TABLE "users" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "comment" text;--> statement-breakpoint
CREATE TABLE "judge_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"judge_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "judge_tracks" ADD CONSTRAINT "judge_tracks_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_tracks" ADD CONSTRAINT "judge_tracks_judge_id_users_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "judge_track_unique" ON "judge_tracks" USING btree ("judge_id","track_id");
