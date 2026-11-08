ALTER TABLE "notifications" ADD COLUMN "email_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "email_notifications" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_email_queue_idx" ON "notifications" USING btree ("created_at") WHERE "notifications"."email_claimed_at" is null;