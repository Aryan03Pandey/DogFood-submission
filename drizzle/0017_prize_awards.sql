CREATE TABLE "prize_awards" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"prize_id" uuid NOT NULL,
"submission_id" uuid NOT NULL,
"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
"awarded_by" uuid NOT NULL,
CONSTRAINT "prize_awards_prize_id_unique" UNIQUE("prize_id"),
CONSTRAINT "prize_awards_prize_id_prizes_id_fk" FOREIGN KEY ("prize_id") REFERENCES "public"."prizes"("id") ON DELETE cascade ON UPDATE no action,
CONSTRAINT "prize_awards_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action,
CONSTRAINT "prize_awards_awarded_by_users_id_fk" FOREIGN KEY ("awarded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);
