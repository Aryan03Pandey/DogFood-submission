CREATE TABLE "signing_keys" (
	"kid" text PRIMARY KEY NOT NULL,
	"public_key_pem" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
