import { PlatformSettingsService } from '../verification/platform-settings.service';
import { VerificationService } from '../verification/verification.service';
import { annotateAudit } from '../audit/audit-context';
import { diff } from '../audit/audit-policy';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, avg, count, desc, eq, ilike, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { MAX_PROFESSIONAL_PROFILES, type ProfessionalProfileInput, type ProfessionalSetupInput, type SearchProfessionalsInput } from '@ergatis/shared';
import { InjectDb } from '../common/db.module';
import type { Db, DbOrTx, Tx } from '../db/client';
import {
  categories, engagements, files, professionalCategories, professionalProfiles, professionals, profiles, reviews, serviceRequests,
} from '../db/schema';
import { entitlementFlagSql, EntitlementsService } from '../entitlements/entitlements.service';

@Injectable()
export class ProfessionalsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly entitlements: EntitlementsService,
    private readonly verification: VerificationService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /** Perfis da pessoa, na ordem, com as categorias de cada um. */
  async profilesOf(userId: string, executor: DbOrTx = this.db) {
    const rows = await executor.select().from(professionalProfiles)
      .where(eq(professionalProfiles.userId, userId)).orderBy(asc(professionalProfiles.position), asc(professionalProfiles.createdAt));
    const cats = await executor.select({ profileId: professionalCategories.profileId, categoryId: professionalCategories.categoryId, name: categories.name })
      .from(professionalCategories).innerJoin(categories, eq(categories.id, professionalCategories.categoryId))
      .where(eq(professionalCategories.professionalId, userId));
    return rows.map((r) => ({
      id: r.id, title: r.title, serviceRadiusKm: r.serviceRadiusKm, position: r.position,
      categoryIds: cats.filter((c) => c.profileId === r.id).map((c) => c.categoryId).sort(),
      categories: cats.filter((c) => c.profileId === r.id).map((c) => c.name),
    }));
  }

  /** Uma categoria fica em um só perfil da pessoa: cada pedido cai num perfil, sem ambiguidade. */
  private async assertCategoriesFree(tx: Tx, userId: string, categoryIds: string[], exceptProfileId?: string) {
    const taken = await tx.select({ categoryId: professionalCategories.categoryId, title: professionalProfiles.title })
      .from(professionalCategories).innerJoin(professionalProfiles, eq(professionalProfiles.id, professionalCategories.profileId))
      .where(and(
        eq(professionalCategories.professionalId, userId), inArray(professionalCategories.categoryId, categoryIds),
        exceptProfileId ? ne(professionalCategories.profileId, exceptProfileId) : undefined,
      ));
    if (taken.length) throw new ConflictException(`Categoria já usada no perfil "${taken[0].title}". Cada categoria fica em um só perfil.`);
  }

  private async writeCategories(tx: Tx, userId: string, profileId: string, categoryIds: string[]) {
    await tx.delete(professionalCategories).where(eq(professionalCategories.profileId, profileId));
    await tx.insert(professionalCategories).values([...new Set(categoryIds)].map((categoryId) => ({ professionalId: userId, profileId, categoryId })));
  }

  /**
   * Tornar-se profissional (cria a pessoa como profissional e o primeiro perfil) ou,
   * para quem já é, atualizar o primeiro perfil. Os demais perfis têm rotas próprias.
   */
  async setup(userId: string, input: ProfessionalSetupInput) {
    const created = await this.db.transaction(async (tx) => {
      const inserted = await tx.insert(professionals).values({ userId }).onConflictDoNothing().returning({ id: professionals.userId });
      const [first] = await tx.select().from(professionalProfiles).where(eq(professionalProfiles.userId, userId))
        .orderBy(asc(professionalProfiles.position), asc(professionalProfiles.createdAt)).limit(1);
      if (!first) {
        const [profile] = await tx.insert(professionalProfiles).values({ userId, title: input.title, serviceRadiusKm: input.serviceRadiusKm }).returning();
        await this.assertCategoriesFree(tx, userId, input.categoryIds, profile.id);
        await this.writeCategories(tx, userId, profile.id, input.categoryIds);
        return { isNew: inserted.length > 0, before: null };
      }
      const before = (await this.profilesOf(userId, tx)).find((p) => p.id === first.id)!;
      await this.assertCategoriesFree(tx, userId, input.categoryIds, first.id);
      await tx.update(professionalProfiles).set({ title: input.title, serviceRadiusKm: input.serviceRadiusKm }).where(eq(professionalProfiles.id, first.id));
      await this.writeCategories(tx, userId, first.id, input.categoryIds);
      return { isNew: false, before };
    });
    annotateAudit({
      summary: created.isNew ? 'Perfil profissional criado' : undefined,
      changes: diff(created.before, { title: input.title, serviceRadiusKm: input.serviceRadiusKm, categoryIds: [...input.categoryIds].sort() }, ['title', 'serviceRadiusKm', 'categoryIds']),
    });
    return this.getPublic(userId);
  }

  async createProfile(userId: string, input: ProfessionalProfileInput) {
    const profile = await this.db.transaction(async (tx) => {
      const [pro] = await tx.select({ id: professionals.userId }).from(professionals).where(eq(professionals.userId, userId)).for('update');
      if (!pro) throw new BadRequestException('Crie seu perfil profissional primeiro');
      const [{ total }] = await tx.select({ total: count() }).from(professionalProfiles).where(eq(professionalProfiles.userId, userId));
      if (total >= MAX_PROFESSIONAL_PROFILES) throw new ConflictException(`Você pode ter até ${MAX_PROFESSIONAL_PROFILES} perfis profissionais`);
      await this.assertCategoriesFree(tx, userId, input.categoryIds);
      const [created] = await tx.insert(professionalProfiles)
        .values({ userId, title: input.title, serviceRadiusKm: input.serviceRadiusKm, position: total }).returning();
      await this.writeCategories(tx, userId, created.id, input.categoryIds);
      return created;
    });
    annotateAudit({ targetId: profile.id, summary: input.title });
    return (await this.profilesOf(userId)).find((p) => p.id === profile.id);
  }

  async updateProfile(userId: string, profileId: string, input: ProfessionalProfileInput) {
    const before = (await this.profilesOf(userId)).find((p) => p.id === profileId);
    if (!before) throw new NotFoundException('Perfil não encontrado');
    await this.db.transaction(async (tx) => {
      await this.assertCategoriesFree(tx, userId, input.categoryIds, profileId);
      await tx.update(professionalProfiles).set({ title: input.title, serviceRadiusKm: input.serviceRadiusKm }).where(eq(professionalProfiles.id, profileId));
      await this.writeCategories(tx, userId, profileId, input.categoryIds);
    });
    annotateAudit({
      targetId: profileId,
      changes: diff(before, { title: input.title, serviceRadiusKm: input.serviceRadiusKm, categoryIds: [...input.categoryIds].sort() }, ['title', 'serviceRadiusKm', 'categoryIds']),
    });
    return (await this.profilesOf(userId)).find((p) => p.id === profileId);
  }

  /** Remove um perfil. Ao menos um fica: sem perfil, a pessoa deixaria de ser profissional por acidente. */
  async removeProfile(userId: string, profileId: string) {
    const removed = await this.db.transaction(async (tx) => {
      const mine = await tx.select().from(professionalProfiles).where(eq(professionalProfiles.userId, userId)).for('update');
      const target = mine.find((p) => p.id === profileId);
      if (!target) throw new NotFoundException('Perfil não encontrado');
      if (mine.length <= 1) throw new ConflictException('Você precisa de ao menos um perfil profissional');
      await tx.delete(professionalProfiles).where(eq(professionalProfiles.id, profileId));
      return target;
    });
    annotateAudit({ targetId: profileId, summary: removed.title });
    return { ok: true };
  }

  async requestVerification(userId: string) {
    const [pro] = await this.db.select().from(professionals).where(eq(professionals.userId, userId));
    if (!pro) throw new NotFoundException('Crie seu perfil profissional primeiro');
    if (pro.verification === 'approved') throw new ConflictException('Perfil já verificado');
    const [document] = await this.db.select({ id: files.id }).from(files)
      .where(and(eq(files.ownerId, userId), eq(files.kind, 'verification_document')));
    if (!document) throw new BadRequestException('Envie um documento antes de solicitar a verificação');
    const status = await this.verification.status(userId);
    if (!status.consent || status.consentOutdated) throw new BadRequestException('Aceite o uso da biometria antes de solicitar a verificação');
    if (status.face?.status !== 'captured') throw new BadRequestException('Faça o reconhecimento facial antes de solicitar a verificação');
    await this.db.update(professionals).set({ verification: 'pending' }).where(eq(professionals.userId, userId));
    return { verification: 'pending' as const };
  }

  /** Perfil público: nunca expõe e-mail, telefone ou coordenadas. */
  async getPublic(userId: string) {
    const [row] = await this.db
      .select({
        userId: professionals.userId,
        displayName: profiles.displayName,
        avatarFileId: profiles.avatarFileId,
        bio: profiles.bio,
        city: profiles.city,
        state: profiles.state,
        verified: sql<boolean>`${professionals.verification} = 'approved'`,
      })
      .from(professionals)
      .innerJoin(profiles, eq(profiles.userId, professionals.userId))
      .where(and(eq(professionals.userId, userId), eq(professionals.active, true)));
    if (!row) throw new NotFoundException('Profissional não encontrado');
    const specialties = (await this.profilesOf(userId)).map(({ id, title, serviceRadiusKm, categories: names }) => ({ id, title, serviceRadiusKm, categories: names }));

    const { entitlements } = await this.entitlements.forUser(userId);
    const [rating] = await this.db
      .select({ average: avg(reviews.rating), total: count() })
      .from(reviews).where(eq(reviews.revieweeId, userId));
    const latestReviews = await this.db
      .select({ rating: reviews.rating, comment: reviews.comment, createdAt: reviews.createdAt })
      .from(reviews).where(eq(reviews.revieweeId, userId))
      .orderBy(desc(reviews.createdAt)).limit(10);

    const completedServices = entitlements.showCompletedServices
      ? await this.db
          .select({
            title: serviceRequests.title,
            city: serviceRequests.city,
            state: serviceRequests.state,
            completedAt: engagements.completedAt,
          })
          .from(engagements)
          .innerJoin(serviceRequests, eq(serviceRequests.id, engagements.requestId))
          .where(and(eq(engagements.professionalId, userId), eq(engagements.status, 'completed')))
          .orderBy(desc(engagements.completedAt)).limit(20)
      : null;

    // O portfólio mostra trabalhos feitos, então segue a mesma regra do plano.
    const portfolio = entitlements.showCompletedServices
      ? await this.db.select({ id: files.id, caption: files.caption }).from(files)
          .where(and(eq(files.ownerId, userId), eq(files.kind, 'portfolio'))).orderBy(asc(files.createdAt))
      : null;

    return {
      ...row,
      // Compatibilidade: o primeiro perfil faz as vezes do antigo título único.
      headline: specialties[0]?.title ?? '',
      serviceRadiusKm: specialties[0]?.serviceRadiusKm ?? null,
      profiles: specialties,
      portfolio,
      badge: entitlements.badge,
      rating: { average: rating.average ? Number(rating.average) : null, total: rating.total },
      latestReviews,
      completedServices,
    };
  }

  async search(input: SearchProfessionalsInput) {
    const hasPoint = input.latitude !== undefined && input.longitude !== undefined;
    const distanceKm: SQL<number | null> = hasPoint
      ? sql<number>`6371 * acos(least(1, greatest(-1,
          cos(radians(${input.latitude})) * cos(radians(${profiles.latitude}))
          * cos(radians(${profiles.longitude}) - radians(${input.longitude}))
          + sin(radians(${input.latitude})) * sin(radians(${profiles.latitude})))))`
      : sql<null>`null`;

    const filters: (SQL | undefined)[] = [eq(professionals.active, true)];
    // Com a verificação obrigatória, só aparece quem foi verificado (ou ainda está na carência).
    const rules = await this.settings.get();
    if (rules.requireVerificationToPropose) {
      const grace = rules.graceForProfessionalsBefore && rules.graceUntil && new Date() < new Date(rules.graceUntil)
        ? sql` or ${professionals.createdAt} < ${new Date(rules.graceForProfessionalsBefore)}` : sql``;
      filters.push(sql`((${professionals.verification} = 'approved' and exists (select 1 from face_enrollments fe
        where fe.user_id = ${professionals.userId} and fe.status = 'approved'))${grace})`);
    }
    if (input.categoryId) {
      // Por perfil: aparece o perfil da pessoa que atende a categoria, com o título e o raio dele.
      filters.push(sql`exists (select 1 from professional_categories pc
        where pc.profile_id = ${professionalProfiles.id} and pc.category_id = ${input.categoryId})`);
    }
    if (input.q) filters.push(ilike(profiles.displayName, `%${input.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
    if (input.state) filters.push(eq(profiles.state, input.state));
    if (input.city) filters.push(sql`lower(${profiles.city}) = lower(${input.city})`);
    if (hasPoint) filters.push(sql`${profiles.latitude} is not null and ${distanceKm} <= ${professionalProfiles.serviceRadiusKm}`);

    const highlight = entitlementFlagSql(professionals.userId, 'searchHighlight');
    const badge = entitlementFlagSql(professionals.userId, 'badge');
    const ratingAverage = sql<number | null>`(select avg(r.rating)::float from reviews r where r.reviewee_id = ${professionals.userId})`;
    const ratingTotal = sql<number>`(select count(*)::int from reviews r where r.reviewee_id = ${professionals.userId})`;

    const where = and(...filters);
    const items = await this.db
      .select({
        userId: professionals.userId,
        profileId: professionalProfiles.id,
        displayName: profiles.displayName,
        avatarFileId: profiles.avatarFileId,
        headline: professionalProfiles.title,
        city: profiles.city,
        state: profiles.state,
        verified: sql<boolean>`${professionals.verification} = 'approved'`,
        highlighted: highlight,
        badge,
        ratingAverage,
        ratingTotal,
        distanceKm,
      })
      .from(professionals)
      .innerJoin(profiles, eq(profiles.userId, professionals.userId))
      .innerJoin(professionalProfiles, eq(professionalProfiles.userId, professionals.userId))
      .where(where)
      .orderBy(
        sql`${highlight} desc`,
        sql`${ratingAverage} desc nulls last`,
        ...(hasPoint ? [sql`${distanceKm} asc nulls last`] : []),
        professionals.userId,
        professionalProfiles.position,
      )
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    const [{ total }] = await this.db.select({ total: count() }).from(professionals)
      .innerJoin(profiles, eq(profiles.userId, professionals.userId))
      .innerJoin(professionalProfiles, eq(professionalProfiles.userId, professionals.userId)).where(where);

    return { items, total, page: input.page, pageSize: input.pageSize };
  }
}
