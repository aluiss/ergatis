ALTER TYPE "public"."file_kind" ADD VALUE 'verification_selfie';--> statement-breakpoint
CREATE TABLE "face_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" varchar(20) NOT NULL,
	"provider" varchar(30) NOT NULL,
	"session_ref" varchar(200) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"liveness_score" double precision,
	"match_score" double precision,
	"failure_reason" varchar(200),
	"request_id" uuid,
	"proposal_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "face_checks_purpose_check" CHECK ("face_checks"."purpose" in ('enrollment', 'proposal')),
	CONSTRAINT "face_checks_status_check" CHECK ("face_checks"."status" in ('pending', 'passed', 'failed', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "face_enrollments" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"consent_version" varchar(20) NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"provider" varchar(30),
	"subject_ref" varchar(200),
	"status" varchar(20),
	"liveness_score" double precision,
	"document_match_score" double precision,
	"captured_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "face_enrollments_status_check" CHECK ("face_enrollments"."status" is null or "face_enrollments"."status" in ('captured', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" varchar(60) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "face_checks" ADD CONSTRAINT "face_checks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_checks" ADD CONSTRAINT "face_checks_request_id_service_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_checks" ADD CONSTRAINT "face_checks_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_enrollments" ADD CONSTRAINT "face_enrollments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "face_checks_user_idx" ON "face_checks" USING btree ("user_id","created_at");--> statement-breakpoint
-- Regras iniciais: verificação obrigatória e checagem facial por proposta; quem já era
-- profissional antes desta migração tem 30 dias de carência (a plataforma está em testes).
INSERT INTO "platform_settings" ("key", "value") VALUES
('verification', jsonb_build_object(
  'requireVerificationToPropose', true,
  'requireFaceCheckPerProposal', true,
  'graceForProfessionalsBefore', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'graceUntil', to_char((now() + interval '30 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
))
ON CONFLICT DO NOTHING;
