ALTER TABLE "payment_webhook_events" ADD COLUMN "sanitized_payload" jsonb;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD COLUMN "duration_ms" integer;
