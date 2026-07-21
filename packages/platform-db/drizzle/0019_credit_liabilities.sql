CREATE TABLE IF NOT EXISTS "credit_liabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"remaining_amount" numeric(10, 2) NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"source_payment_id" text,
	"source_refund_id" text,
	"source_dispute_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"waived_at" timestamp with time zone,
	CONSTRAINT "credit_liabilities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "credit_liabilities_amount_positive" CHECK ("amount" > 0 AND "remaining_amount" >= 0),
	CONSTRAINT "credit_liabilities_status_valid" CHECK ("status" IN ('open', 'settled', 'waived')),
	CONSTRAINT "credit_liabilities_reason_valid" CHECK ("reason" IN ('refund', 'chargeback', 'dispute', 'manual'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_liabilities_user_status_idx" ON "credit_liabilities" USING btree ("user_id", "status");
