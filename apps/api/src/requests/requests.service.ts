import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, avg, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { CreateRequestInput } from '@ergatis/shared';
import { InjectDb } from '../common/db.module';
import type { Db } from '../db/client';
import {
  categories, professionalCategories, professionalProfiles, professionals, profiles, proposals, reviews, serviceRequests,
} from '../db/schema';
import { entitlementFlagSql, EntitlementsService } from '../entitlements/entitlements.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class RequestsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly entitlements: EntitlementsService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(clientId: string, input: CreateRequestInput) {
    const [category] = await this.db.select({ id: categories.id }).from(categories)
      .where(and(eq(categories.id, input.categoryId), eq(categories.active, true)));
    if (!category) throw new NotFoundException('Categoria não encontrada');

    const [created] = await this.db.insert(serviceRequests).values({
      ...input,
      clientId,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
    }).returning();
    return created;
  }

  mine(clientId: string) {
    return this.db.select().from(serviceRequests).where(eq(serviceRequests.clientId, clientId))
      .orderBy(desc(serviceRequests.createdAt)).limit(100);
  }

  /** Pedidos abertos nas categorias do profissional. Coordenadas exatas não são expostas. */
  /**
   * Pedidos abertos nas categorias da pessoa. Com `profileId`, só as do perfil escolhido.
   * Cada item diz em qual perfil se encaixa (uma categoria está em um só perfil).
   */
  async feed(professionalId: string, profileId?: string) {
    const [pro] = await this.db.select({ id: professionals.userId }).from(professionals)
      .where(eq(professionals.userId, professionalId));
    if (!pro) throw new ForbiddenException('Crie seu perfil profissional primeiro');

    const mineCategories = await this.db
      .select({ id: professionalCategories.categoryId, profileId: professionalCategories.profileId, profileTitle: professionalProfiles.title })
      .from(professionalCategories).innerJoin(professionalProfiles, eq(professionalProfiles.id, professionalCategories.profileId))
      .where(and(
        eq(professionalCategories.professionalId, professionalId),
        profileId ? eq(professionalCategories.profileId, profileId) : undefined,
      ));
    if (mineCategories.length === 0) return [];
    const profileOf = new Map(mineCategories.map((c) => [c.id, { profileId: c.profileId, profileTitle: c.profileTitle }]));

    const rows = await this.db
      .select({
        id: serviceRequests.id, title: serviceRequests.title, description: serviceRequests.description,
        city: serviceRequests.city, state: serviceRequests.state, budgetCents: serviceRequests.budgetCents,
        urgent: serviceRequests.urgent, scheduledFor: serviceRequests.scheduledFor,
        categoryId: serviceRequests.categoryId, createdAt: serviceRequests.createdAt,
        alreadyProposed: sql<boolean>`exists (select 1 from proposals p
          where p.request_id = ${serviceRequests.id} and p.professional_id = ${professionalId})`,
      })
      .from(serviceRequests)
      .where(and(
        eq(serviceRequests.status, 'open'),
        ne(serviceRequests.clientId, professionalId),
        inArray(serviceRequests.categoryId, mineCategories.map((c) => c.id)),
      ))
      .orderBy(desc(serviceRequests.urgent), desc(serviceRequests.createdAt)).limit(100);
    return rows.map((r) => ({ ...r, ...profileOf.get(r.categoryId) }));
  }

  async detail(userId: string, id: string) {
    const [request] = await this.db.select().from(serviceRequests).where(eq(serviceRequests.id, id));
    if (!request) throw new NotFoundException('Pedido não encontrado');

    if (request.clientId === userId) {
      const received = await this.db
        .select({
          id: proposals.id, professionalId: proposals.professionalId, amountCents: proposals.amountCents,
          message: proposals.message, status: proposals.status, createdAt: proposals.createdAt,
          displayName: profiles.displayName,
          // O título do perfil com que a proposta foi feita (ex.: "Eletricista", e não "Pintor").
          headline: sql<string>`coalesce(${professionalProfiles.title}, (select pp.title from professional_profiles pp
            where pp.user_id = ${proposals.professionalId} order by pp.position limit 1))`,
          badge: entitlementFlagSql(proposals.professionalId, 'badge'),
          ratingAverage: sql<number | null>`(select avg(r.rating)::float from reviews r where r.reviewee_id = ${proposals.professionalId})`,
        })
        .from(proposals)
        .innerJoin(professionals, eq(professionals.userId, proposals.professionalId))
        .innerJoin(profiles, eq(profiles.userId, proposals.professionalId))
        .leftJoin(professionalProfiles, eq(professionalProfiles.id, proposals.profileId))
        .where(eq(proposals.requestId, id))
        .orderBy(desc(proposals.createdAt));
      return { ...request, proposals: received };
    }

    const [own] = await this.db.select().from(proposals)
      .where(and(eq(proposals.requestId, id), eq(proposals.professionalId, userId)));
    if (request.status !== 'open' && !own) throw new NotFoundException('Pedido não encontrado');

    const [pro] = await this.db.select({ id: professionals.userId }).from(professionals)
      .where(eq(professionals.userId, userId));
    if (!pro) throw new ForbiddenException('Acesso restrito a profissionais');

    const { entitlements } = await this.entitlements.forUser(userId);
    let clientRating: { average: number | null; total: number } | null = null;
    if (entitlements.viewClientRating) {
      const [r] = await this.db.select({ average: avg(reviews.rating), total: count() })
        .from(reviews).where(eq(reviews.revieweeId, request.clientId));
      clientRating = { average: r.average ? Number(r.average) : null, total: r.total };
    }

    const { clientId: _clientId, latitude: _lat, longitude: _lng, ...visible } = request;
    return { ...visible, clientRating, clientRatingLocked: !entitlements.viewClientRating, myProposal: own ?? null };
  }

  async cancel(clientId: string, id: string) {
    return this.db.transaction(async (tx) => {
      const [request] = await tx.select().from(serviceRequests).where(eq(serviceRequests.id, id)).for('update');
      if (!request || request.clientId !== clientId) throw new NotFoundException('Pedido não encontrado');
      if (request.status !== 'open') throw new ConflictException('Só é possível cancelar pedidos abertos');

      await tx.update(serviceRequests).set({ status: 'cancelled' }).where(eq(serviceRequests.id, id));
      const affected = await tx.update(proposals).set({ status: 'rejected' })
        .where(and(eq(proposals.requestId, id), eq(proposals.status, 'sent')))
        .returning({ professionalId: proposals.professionalId });
      for (const p of affected) {
        await this.notifications.notify(tx, p.professionalId, 'request_cancelled', `Pedido cancelado: ${request.title}`);
      }
      return { ok: true };
    });
  }
}
