CREATE TABLE "broker_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"broker" text NOT NULL,
	"label" text DEFAULT 'Default' NOT NULL,
	"api_key" text NOT NULL,
	"api_secret" text NOT NULL,
	"environment" text DEFAULT 'paper' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broker_connections_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "broker_connections_user_id_idx" ON "broker_connections" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "broker_connections_user_broker_env_idx" ON "broker_connections" ("user_id", "broker", "environment");
