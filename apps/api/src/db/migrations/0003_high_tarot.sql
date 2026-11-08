DROP INDEX "audit_actor_idx";--> statement-breakpoint
DROP INDEX "audit_target_idx";--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "request_id" varchar(64);--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_role" varchar(20);--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "summary" varchar(255);--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "changes" jsonb;--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_request_idx" ON "audit_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_logs" USING btree ("target_type","target_id","created_at");