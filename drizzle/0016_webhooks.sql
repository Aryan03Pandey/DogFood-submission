CREATE TABLE "webhook_endpoints" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"event_id" uuid NOT NULL,
"url" text NOT NULL,
"secret" text NOT NULL,
"is_active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"created_by" uuid NOT NULL,
CONSTRAINT "webhook_endpoints_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action,
CONSTRAINT "webhook_endpoints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"endpoint_id" uuid NOT NULL,
"event_id" uuid NOT NULL,
"event_type" text NOT NULL,
"payload_json" jsonb NOT NULL,
"status" text DEFAULT 'PENDING' NOT NULL,
"attempts" integer DEFAULT 0 NOT NULL,
"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
"lease_until" timestamp with time zone,
"last_error" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"delivered_at" timestamp with time zone,
CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action,
CONSTRAINT "webhook_deliveries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_singleton_event_idx" ON "webhook_deliveries" USING btree ("endpoint_id","event_id","event_type") WHERE "event_type" IN ('judging.completed', 'results.published');
