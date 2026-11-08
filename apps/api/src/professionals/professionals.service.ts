import { annotateAudit } from '../audit/audit-context';
import { diff } from '../audit/audit-policy';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, avg, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { ProfessionalSetupInput, SearchProfessionalsInput } from '@ergatis/shared';
import { InjectDb } from '../common/db.module';
import type { Db } from '../db/client';
import {
  engagements, files, professionalCategories, professionals, profiles, reviews, serviceRequests,
} from '../db/schema';
import { entitlementFlagSql, EntitlementsService } from '../entitlements/entitlements.service';

@Injectable()
export class ProfessionalsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly entitlements: EntitlementsService,
  ) {}

  async setup(userId: string, input: ProfessionalSetupInput) {
    const [before] = await this.db.select().from(professionals).where(eq(professionals.userId, userId));
    const beforeCategories = (await this.db.select({ id: professionalCategories.categoryId }).from(professionalCategories)
      .where(eq(professionalCategories.professionalId, userId))).map((c) => c.id).sort();
    await this.db.transaction(async (tx) => {
      await tx.insert(professionals)
        .values({ userId, headline: input.headline, serviceRadiusKm: input.serviceRadiusKm })
        .onConflictDoUpdate({
          target: professionals.userId,
          set: { headline: input.headline, serviceRadiusKm: input.serviceRadiusKm },
        });
      await tx.delete(professionalCategories).where(eq(professionalCategories.professionalId, userId));
      await tx.insert(professionalCategories)
        .values(input.categoryIds.map((categoryId) => ({ professionalId: userId, categoryId })));
    });
    annotateAudit({
      summary: before ? undefined : 'Perfil profissional criado',
      changes: diff(
        before ? { ...before, categoryIds: beforeCategories } : null,
        { headline: input.headline, serviceRadiusKm: input.serviceRadiusKm, categoryIds: [...input.categoryIds].sort() },
      ),
    });
    return this.getPublic(userId);
  }

  async requestVerification(userId: string) {
    const [pro] = await this.db.select().from(professionals).where(eq(professionals.userId, userId));
    if (!pro) throw new NotFoundException('Crie seu perfil profissional primeiro');
    if (pro.verification === 'approved') throw new ConflictException('Perfil já verificado');
    const [document] = await this.db.select({ id: files.id }).from(files)
      .where(and(eq(files.ownerId, userId), eq(files.kind, 'verification_document')));
    if (!document) throw new BadRequestException('Envie um documento antes de solicitar a verificação');
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
        headline: professionals.headline,
        serviceRadiusKm: professionals.serviceRadiusKm,
        verified: sql<boolean>`${professionals.verification} = 'approved'`,
      })
      .from(professionals)
      .innerJoin(profiles, eq(profiles.userId, professionals.userId))
      .where(and(eq(professionals.userId, userId), eq(professionals.active, true)));
    if (!row) throw new NotFoundException('Profissional não encontrado');

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
    if (input.categoryId) {
      filters.push(sql`exists (select 1 from professional_categories pc
        where pc.professional_id = ${professionals.userId} and pc.category_id = ${input.categoryId})`);
    }
    if (input.state) filters.push(eq(profiles.state, input.state));
    if (input.city) filters.push(sql`lower(${profiles.city}) = lower(${input.city})`);
    if (hasPoint) filters.push(sql`${profiles.latitude} is not null and ${distanceKm} <= ${professionals.serviceRadiusKm}`);

    const highlight = entitlementFlagSql(professionals.userId, 'searchHighlight');
    const badge = entitlementFlagSql(professionals.userId, 'badge');
    const ratingAverage = sql<number | null>`(select avg(r.rating)::float from reviews r where r.reviewee_id = ${professionals.userId})`;
    const ratingTotal = sql<number>`(select count(*)::int from reviews r where r.reviewee_id = ${professionals.userId})`;

    const where = and(...filters);
    const items = await this.db
      .select({
        userId: professionals.userId,
        displayName: profiles.displayName,
        avatarFileId: profiles.avatarFileId,
        headline: professionals.headline,
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
      .where(where)
      .orderBy(
        sql`${highlight} desc`,
        sql`${ratingAverage} desc nulls last`,
        ...(hasPoint ? [sql`${distanceKm} asc nulls last`] : []),
        professionals.userId,
      )
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    const [{ total }] = await this.db.select({ total: count() }).from(professionals)
      .innerJoin(profiles, eq(profiles.userId, professionals.userId)).where(where);

    return { items, total, page: input.page, pageSize: input.pageSize };
  }
}
