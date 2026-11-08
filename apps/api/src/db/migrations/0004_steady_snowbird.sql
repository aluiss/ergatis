CREATE TABLE "access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_key" varchar(60) NOT NULL,
	"level" varchar(10) NOT NULL,
	"role" varchar(20),
	"user_id" uuid,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_grants_subject_check" CHECK (("access_grants"."role" is null) <> ("access_grants"."user_id" is null)),
	CONSTRAINT "access_grants_level_check" CHECK ("access_grants"."level" in ('view', 'edit')),
	CONSTRAINT "access_grants_role_check" CHECK ("access_grants"."role" is null or "access_grants"."role" in ('admin', 'moderacao', 'suporte', 'financeiro', 'juridico'))
);
--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_grants_role_uq" ON "access_grants" USING btree ("resource_key","role") WHERE "access_grants"."role" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "access_grants_user_uq" ON "access_grants" USING btree ("resource_key","user_id") WHERE "access_grants"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "access_grants_user_idx" ON "access_grants" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_check" CHECK ("user"."role" is null or "user"."role" in ('user', 'owner', 'admin', 'moderacao', 'suporte', 'financeiro', 'juridico'));--> statement-breakpoint
-- Pacote inicial de cada papel (gerado de DEFAULT_ROLE_GRANTS em @ergatis/shared). Roda uma vez: o proprietário ajusta depois na tela.
INSERT INTO "access_grants" ("resource_key", "level", "role") VALUES
('admin.overview', 'edit', 'admin'),
('admin.users', 'edit', 'admin'),
('admin.verifications', 'edit', 'admin'),
('admin.reports', 'edit', 'admin'),
('admin.plans', 'edit', 'admin'),
('admin.subscriptions', 'edit', 'admin'),
('admin.audit', 'edit', 'admin'),
('admin.settings', 'edit', 'admin'),
('grants.manage', 'edit', 'admin'),
('documents.view', 'edit', 'admin'),
('audit.export', 'edit', 'admin'),
('admin.access', 'view', 'admin'),
('admin.overview', 'view', 'moderacao'),
('admin.users', 'edit', 'moderacao'),
('admin.verifications', 'edit', 'moderacao'),
('admin.reports', 'edit', 'moderacao'),
('documents.view', 'edit', 'moderacao'),
('admin.overview', 'view', 'suporte'),
('admin.users', 'view', 'suporte'),
('admin.reports', 'view', 'suporte'),
('admin.subscriptions', 'view', 'suporte'),
('grants.manage', 'edit', 'suporte'),
('admin.overview', 'view', 'financeiro'),
('admin.users', 'view', 'financeiro'),
('admin.plans', 'edit', 'financeiro'),
('admin.subscriptions', 'view', 'financeiro'),
('grants.manage', 'edit', 'financeiro'),
('admin.overview', 'view', 'juridico'),
('admin.users', 'view', 'juridico'),
('admin.reports', 'edit', 'juridico'),
('admin.audit', 'view', 'juridico'),
('audit.export', 'edit', 'juridico'),
('documents.view', 'edit', 'juridico')
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Sem proprietário ainda: o admin mais antigo passa a ser. Sem isso, ninguém conseguiria administrar o acesso.
UPDATE "user" SET "role" = 'owner'
WHERE "id" = (SELECT "id" FROM "user" WHERE "role" = 'admin' ORDER BY "created_at" LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "user" WHERE "role" = 'owner');
