import {
  Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, ParseUUIDPipe, Post,
} from '@nestjs/common';
import { desc, eq, or, sql } from 'drizzle-orm';
import { createReviewSchema, type CreateReviewInput } from '@ergatis/shared';
import { InjectDb } from '../common/db.module';
import { isUniqueViolation } from '../common/pg-errors';
import { UserId } from '../common/user-id.decorator';
import { ZodPipe } from '../common/zod.pipe';
import type { Db } from '../db/client';
import { engagements, reviews, serviceRequests } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
class EngagementsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly notifications: NotificationsService,
  ) {}

  mine(userId: string) {
    return this.db
      .select({
        id: engagements.id, status: engagements.status, agreedCents: engagements.agreedCents,
        clientId: engagements.clientId, professionalId: engagements.professionalId,
        completedAt: engagements.completedAt, createdAt: engagements.createdAt,
        requestId: engagements.requestId, title: serviceRequests.title,
        reviewedByMe: sql<boolean>`exists (select 1 from reviews r
          where r.engagement_id = ${engagements.id} and r.reviewer_id = ${userId})`,
      })
      .from(engagements)
      .innerJoin(serviceRequests, eq(serviceRequests.id, engagements.requestId))
      .where(or(eq(engagements.clientId, userId), eq(engagements.professionalId, userId)))
      .orderBy(desc(engagements.createdAt)).limit(100);
  }

  /** Só o cliente conclui: o serviço concluído aparece no perfil público do profissional. */
  async complete(clientId: string, id: string) {
    return this.db.transaction(async (tx) => {
      const [e] = await tx.select().from(engagements).where(eq(engagements.id, id)).for('update');
      if (!e || e.clientId !== clientId) throw new NotFoundException('Contratação não encontrada');
      if (e.status !== 'active') throw new ConflictException('Esta contratação já foi encerrada');

      const [updated] = await tx.update(engagements)
        .set({ status: 'completed', completedAt: new Date() }).where(eq(engagements.id, id)).returning();
      await tx.update(serviceRequests).set({ status: 'completed' }).where(eq(serviceRequests.id, e.requestId));
      await this.notifications.notify(tx, e.professionalId, 'engagement_completed', 'Serviço concluído. Avalie o cliente.', '/contratacoes');
      return updated;
    });
  }

  async cancel(userId: string, id: string) {
    return this.db.transaction(async (tx) => {
      const [e] = await tx.select().from(engagements).where(eq(engagements.id, id)).for('update');
      if (!e || (e.clientId !== userId && e.professionalId !== userId)) throw new NotFoundException('Contratação não encontrada');
      if (e.status !== 'active') throw new ConflictException('Esta contratação já foi encerrada');

      const [updated] = await tx.update(engagements).set({ status: 'cancelled' }).where(eq(engagements.id, id)).returning();
      await tx.update(serviceRequests).set({ status: 'cancelled' }).where(eq(serviceRequests.id, e.requestId));
      const other = userId === e.clientId ? e.professionalId : e.clientId;
      await this.notifications.notify(tx, other, 'engagement_cancelled', 'Uma contratação foi cancelada.', '/contratacoes');
      return updated;
    });
  }

  async review(reviewerId: string, id: string, input: CreateReviewInput) {
    const [e] = await this.db.select().from(engagements).where(eq(engagements.id, id));
    if (!e || (e.clientId !== reviewerId && e.professionalId !== reviewerId)) throw new NotFoundException('Contratação não encontrada');
    if (e.status !== 'completed') throw new ForbiddenException('Avalie somente após a conclusão do serviço');

    const revieweeId = reviewerId === e.clientId ? e.professionalId : e.clientId;
    try {
      const [created] = await this.db.insert(reviews)
        .values({ engagementId: id, reviewerId, revieweeId, ...input }).returning();
      await this.notifications.notify(this.db, revieweeId, 'review_received', 'Você recebeu uma avaliação.');
      return created;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Você já avaliou esta contratação');
      throw error;
    }
  }
}

@Controller('engagements')
class EngagementsController {
  constructor(private readonly service: EngagementsService) {}

  @Get('mine') mine(@UserId() userId: string) { return this.service.mine(userId); }

  @Post(':id/complete')
  complete(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.complete(userId, id); }

  @Post(':id/cancel')
  cancel(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.cancel(userId, id); }

  @Post(':id/review')
  review(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(createReviewSchema)) body: CreateReviewInput,
  ) { return this.service.review(userId, id, body); }
}

@Module({ controllers: [EngagementsController], providers: [EngagementsService] })
export class EngagementsModule {}
