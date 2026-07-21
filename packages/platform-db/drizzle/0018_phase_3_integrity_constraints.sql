CREATE INDEX IF NOT EXISTS "notification_user_unread_created_idx" ON "notification" USING btree ("user_id", "read", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transactions_user_created_at_idx" ON "credit_transactions" USING btree ("user_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_webhook_events_retry_idx" ON "payment_webhook_events" USING btree ("processing_status", "next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_user_expires_idx" ON "api_keys" USING btree ("user_id", "expires_at");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_non_negative" CHECK ("balance" >= 0 AND "total_purchased" >= 0 AND "total_spent" >= 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_type_valid" CHECK ("type" IN ('purchase', 'usage', 'refund', 'bonus', 'admin_adjustment', 'voucher'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_amounts_non_negative" CHECK ("credits" > 0 AND "bonus_credits" >= 0 AND "price" >= 0 AND "price_excl_vat" >= 0 AND "price_incl_vat" >= 0 AND "vat_amount" >= 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_status_valid" CHECK ("payment_status" IN ('pending', 'completed', 'failed', 'refunded'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_status_valid" CHECK ("processing_status" IN ('processing', 'processed', 'failed', 'dead_lettered'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_retry_count_non_negative" CHECK ("retry_count" >= 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "jobs" ADD CONSTRAINT "jobs_status_valid" CHECK ("status" IN ('idle', 'running', 'disabled'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "jobs" ADD CONSTRAINT "jobs_interval_seconds_positive" CHECK ("interval_seconds" > 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_status_valid" CHECK ("status" IN ('success', 'failed'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_duration_ms_non_negative" CHECK ("duration_ms" >= 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "pending_emails" ADD CONSTRAINT "pending_emails_status_valid" CHECK ("status" IN ('pending', 'sending', 'sent', 'failed'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "pending_emails" ADD CONSTRAINT "pending_emails_attempts_valid" CHECK ("attempts" >= 0 AND "max_attempts" > 0 AND "attempts" <= "max_attempts");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
