-- Vários perfis profissionais por pessoa. Ordem pensada para não perder dados:
-- cria os perfis, copia título e raio de cada profissional para o primeiro perfil dele,
-- liga categorias e propostas a esse perfil e só então remove as colunas antigas.
CREATE TABLE "professional_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"service_radius_km" integer DEFAULT 20 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "professional_profiles_radius_check" CHECK ("professional_profiles"."service_radius_km" between 1 and 300)
);
--> statement-breakpoint
ALTER TABLE "professional_profiles" ADD CONSTRAINT "professional_profiles_user_id_professionals_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."professionals"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "professional_profiles_user_idx" ON "professional_profiles" USING btree ("user_id","position");--> statement-breakpoint
INSERT INTO "professional_profiles" ("user_id", "title", "service_radius_km", "position", "created_at")
SELECT "user_id", "headline", "service_radius_km", 0, "created_at" FROM "professionals";--> statement-breakpoint
ALTER TABLE "professional_categories" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
UPDATE "professional_categories" pc SET "profile_id" = pp."id" FROM "professional_profiles" pp WHERE pp."user_id" = pc."professional_id";--> statement-breakpoint
ALTER TABLE "professional_categories" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "professional_categories" ADD CONSTRAINT "professional_categories_profile_id_professional_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."professional_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "professional_categories_profile_idx" ON "professional_categories" USING btree ("profile_id");--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
UPDATE "proposals" p SET "profile_id" = pp."id" FROM "professional_profiles" pp WHERE pp."user_id" = p."professional_id";--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_profile_id_professional_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."professional_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professionals" DROP CONSTRAINT "professionals_radius_check";--> statement-breakpoint
ALTER TABLE "professionals" DROP COLUMN "headline";--> statement-breakpoint
ALTER TABLE "professionals" DROP COLUMN "service_radius_km";
