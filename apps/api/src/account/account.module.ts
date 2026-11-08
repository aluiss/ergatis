import {
  Body, ConflictException, Controller, Delete, Get, Injectable, Module, Patch,
} from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import { updateProfileSchema, type UpdateProfileInput } from '@ergatis/shared';
import { InjectDb } from '../common/db.module';
import { Audit, SkipAudit } from '../audit/audit.interceptor';
import { UserId } from '../common/user-id.decorator';
import { ZodPipe } from '../common/zod.pipe';
import type { Db } from '../db/client';
import {
  account, auditLogs, engagements, legalAcceptances, professionalCategories, professionals, profiles, proposalUsage, reviews, serviceRequests, session,
  subscriptions, user,
} from '../db/schema';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { FilesService } from '../files/files.service';
import { currentPeriod } from '../proposals/proposals.service';

@Injectable()
class AccountService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly entitlements: EntitlementsService,
    private readonly files: FilesService,
  ) {}

  async me(userId: string) {
    const [profile] = await this.db.select().from(profiles).where(eq(profiles.userId, userId));
    const [professional] = await this.db.select().from(professionals).where(eq(professionals.userId, userId));
    const categoryRows = await this.db.select({ id: professionalCategories.categoryId })
      .from(professionalCategories).where(eq(professionalCategories.professionalId, userId));
    const access = await this.entitlements.forUser(userId);
    const [usage] = await this.db.select({ used: proposalUsage.used }).from(proposalUsage)
      .where(and(eq(proposalUsage.professionalId, userId), eq(proposalUsage.period, currentPeriod())));
    return {
      profile,
      professional: professional ? { ...professional, categoryIds: categoryRows.map((c) => c.id) } : null,
      ...access,
      proposalsUsed: usage?.used ?? 0,
    };
  }

  async update(userId: string, input: UpdateProfileInput) {
    const [updated] = await this.db.update(profiles).set(input).where(eq(profiles.userId, userId)).returning();
    return updated;
  }

  /** Portabilidade (LGPD): tudo o que está ligado ao titular. */
  async export(userId: string) {
    const [identity] = await this.db
      .select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt })
      .from(user).where(eq(user.id, userId));
    return {
      identity,
      ...(await this.me(userId)),
      files: await this.files.mine(userId),
      legalAcceptances: await this.db.select().from(legalAcceptances).where(eq(legalAcceptances.userId, userId)),
      requests: await this.db.select().from(serviceRequests).where(eq(serviceRequests.clientId, userId)),
      reviewsWritten: await this.db.select().from(reviews).where(eq(reviews.reviewerId, userId)),
      subscriptions: await this.db.select().from(subscriptions).where(eq(subscriptions.userId, userId)),
    };
  }

  /**
   * Anonimiza em vez de apagar: contratações e avaliações de terceiros
   * dependem do registro, mas os dados pessoais são removidos.
   */
  async remove(userId: string) {
    const [active] = await this.db.select({ id: engagements.id }).from(engagements).where(and(
      or(eq(engagements.clientId, userId), eq(engagements.professionalId, userId)),
      eq(engagements.status, 'active'),
    ));
    if (active) throw new ConflictException('Conclua ou cancele suas contratações antes de excluir a conta');

    const [sub] = await this.db.select({ id: subscriptions.id }).from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')));
    if (sub) throw new ConflictException('Cancele sua assinatura antes de excluir a conta');

    await this.db.transaction(async (tx) => {
      await tx.update(serviceRequests).set({ status: 'cancelled' })
        .where(and(eq(serviceRequests.clientId, userId), eq(serviceRequests.status, 'open')));
      await tx.update(professionals).set({ active: false }).where(eq(professionals.userId, userId));
      await tx.update(profiles).set({
        displayName: 'Usuário removido', phone: null, bio: null, city: null, state: null, latitude: null, longitude: null,
      }).where(eq(profiles.userId, userId));
      await tx.update(user).set({
        name: 'Usuário removido', email: `removido-${userId}@ergatis.invalid`, image: null,
        banned: true, banReason: 'Conta excluída pelo titular',
      }).where(eq(user.id, userId));
      await tx.delete(session).where(eq(session.userId, userId));
      await tx.delete(account).where(eq(account.userId, userId));
      await tx.insert(auditLogs).values({ actorId: userId, action: 'account.deleted', targetType: 'user', targetId: userId });
    });
    await this.files.removeAll(userId);
    return { ok: true };
  }
}

@Controller('me')
class AccountController {
  constructor(private readonly service: AccountService) {}

  @Get() me(@UserId() userId: string) { return this.service.me(userId); }

  @Patch() @Audit('profile.updated', 'user', { targetSelf: true })
  update(@UserId() userId: string, @Body(new ZodPipe(updateProfileSchema)) body: UpdateProfileInput) {
    return this.service.update(userId, body);
  }

  @Get('export') @Audit('account.data_exported', 'user', { targetSelf: true }) export(@UserId() userId: string) { return this.service.export(userId); }
  @Delete() @SkipAudit('registrado na transação de exclusão') remove(@UserId() userId: string) { return this.service.remove(userId); }
}

@Module({ controllers: [AccountController], providers: [AccountService] })
export class AccountModule {}
