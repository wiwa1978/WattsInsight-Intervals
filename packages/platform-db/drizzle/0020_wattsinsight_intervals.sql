CREATE TABLE "intervals_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"intervals_activity_id" text NOT NULL,
	"name" text,
	"type" text,
	"start_date_local" timestamp with time zone NOT NULL,
	"moving_time_seconds" integer,
	"elapsed_time_seconds" integer,
	"distance_meters" numeric,
	"average_hr" integer,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intervals_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"athlete_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"scope" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intervals_activity" ADD CONSTRAINT "intervals_activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervals_activity" ADD CONSTRAINT "intervals_activity_connection_id_intervals_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."intervals_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervals_connection" ADD CONSTRAINT "intervals_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "intervals_activity_user_activity_unique" ON "intervals_activity" USING btree ("user_id","intervals_activity_id");--> statement-breakpoint
CREATE INDEX "intervals_activity_user_start_idx" ON "intervals_activity" USING btree ("user_id","start_date_local");--> statement-breakpoint
CREATE UNIQUE INDEX "intervals_connection_user_unique" ON "intervals_connection" USING btree ("user_id");
