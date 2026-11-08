import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { and, count, desc, eq, ilike, inArray, isNull, like, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import {
  grantSchema, PLAN_CODES, REPORT_STATUSES, type GrantInput,
} from '@ergatis/shared';
import { InjectDb } from '../common/db.module';
import { SkipAudit } from '../audit/audit.interceptor';
import { UserId } from '../common/user-id.decorator';
import { ZodPipe } from '../common/zod.pipe';
import type { Db, DbOrTx } from '../db/client';
import {
  auditLogs, engagements, entitlementGrants, files, plans, professionals, reports, serviceRequests,
  session, subscriptions, user,
} from '../db/schema';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';

const listSchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
const auditListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  /** Prefixo da ação: "auth." traz login, logout, senha etc. */
  action: z.string().trim().max(80).regex(/^[a-z_.]*$/).optional(),
  /** Nome ou e-mail de quem fez ou de quem sofreu a ação. */
  q: z.string().trim().max(120).optional(),
  targetId: z.string().trim().max(80).optional(),
});
const banSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const roleSchema = z.object({ role: z.enum(['user', 'admin']) });
const planSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  priceCents: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  entitlements: z.object({
    monthlyProposalLimit: z.number().int().min(0).nullable(),
    showCompletedServices: z.boolean(),
    searchHighlight: z.boolean(),
    badge: z.boolean(),
    viewClientRating: z.boolean(),
  }).optional(),
});
const reportSchema = z.object({
  status: z.enum(REPORT_STATUSES),
  resolution: z.string().trim().max(1000).optional(),
});
const verificationSchema = z.object({ approved: z.boolean() });

const PAGE_SIZE = 25;

@Injectable()
class AdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly entitlements: EntitlementsService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
  ) {}

  private audit(tx: DbOrTx, actorId: string, action: string, targetType: string, targetId: string, metadata?: unknown) {
    return tx.insert(auditLogs).values({ actorId, action, targetType, targetId, metadata });
  }

  async metrics() {
    const one = async (q: Promise<{ value: number }[]>) => (await q)[0].value;
    const [users, pros, open, completed, paying, mrr, openReports, pendingVerifications] = [
      await one(this.db.select({ value: count() }).from(user)),
      await one(this.db.select({ value: count() }).from(professionals)),
      await one(this.db.select({ value: count() }).from(serviceRequests).where(eq(serviceRequests.status, 'open'))),
      await one(this.db.select({ value: count() }).from(engagements).where(eq(engagements.status, 'completed'))),
      await one(this.db.select({ value: count() }).from(subscriptions).where(eq(subscriptions.status, 'active'))),
      await one(this.db.select({ value: sql<number>`coalesce(sum(${plans.priceCents}), 0)::int` })
        .from(subscriptions).innerJoin(plans, eq(plans.code, subscriptions.planCode))
        .where(and(eq(subscriptions.status, 'active'), isNull(subscriptions.cancelledAt)))),
      await one(this.db.select({ value: count() }).from(reports).where(eq(reports.status, 'open'))),
      await one(this.db.select({ value: count() }).from(professionals).where(eq(professionals.verification, 'pending'))),
    ];
    return { users, pros, open, completed, paying, mrrCents: mrr, openReports, pendingVerifications };
  }

  async users({ q, page }: z.infer<typeof listSchema>) {
    const where = q ? or(ilike(user.email, `%${q}%`), ilike(user.name, `%${q}%`)) : undefined;
    const items = await this.db
      .select({
        id: user.id, name: user.name, email: user.email, role: user.role,
        banned: user.banned, banReason: user.banReason, createdAt: user.createdAt,
      })
      .from(user).where(where).orderBy(desc(user.createdAt))
      .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
    const [{ total }] = await this.db.select({ total: count() }).from(user).where(where);
    return { items, total, page, pageSize: PAGE_SIZE };
  }

  async userDetail(id: string) {
    const [found] = await this.db
      .select({
        id: user.id, name: user.name, email: user.email, role: user.role,
        banned: user.banned, banReason: user.banReason, createdAt: user.createdAt,
      })
      .from(user).where(eq(user.id, id));
    if (!found) throw new NotFoundException('Usuário não encontrado');
    return {
      ...found,
      access: await this.entitlements.forUser(id),
      subscriptions: await this.db.select().from(subscriptions).where(eq(subscriptions.userId, id)).orderBy(desc(subscriptions.createdAt)),
      grants: await this.db.select().from(entitlementGrants).where(eq(entitlementGrants.userId, id)).orderBy(desc(entitlementGrants.createdAt)),
    };
  }

  private async setBan(actorId: string, id: string, banned: boolean, reason: string | null) {
    if (id === actorId) throw new BadRequestException('Você não pode alterar a própria conta');
    return this.db.transaction(async (tx) => {
      const [updated] = await tx.update(user).set({ banned, banReason: reason }).where(eq(user.id, id)).returning({ id: user.id });
      if (!updated) throw new NotFoundException('Usuário não encontrado');
      if (banned) await tx.delete(session).where(eq(session.userId, id));
      await this.audit(tx, actorId, banned ? 'user.banned' : 'user.unbanned', 'user', id, { reason });
      return { ok: true };
    });
  }

  ban(actorId: string, id: string, reason: string) { return this.setBan(actorId, id, true, reason); }
  unban(actorId: string, id: string) { return this.setBan(actorId, id, false, null); }

  async setRole(actorId: string, id: string, role: 'user' | 'admin') {
    if (id === actorId) throw new BadRequestException('Você não pode alterar a própria conta');
    return this.db.transaction(async (tx) => {
      const [updated] = await tx.update(user).set({ role }).where(eq(user.id, id)).returning({ id: user.id });
      if (!updated) throw new NotFoundException('Usuário não encontrado');
      await this.audit(tx, actorId, 'user.role_changed', 'user', id, { role });
      return { ok: true };
    });
  }

  async grant(actorId: string, input: GrantInput) {
    return this.db.transaction(async (tx) => {
      const [target] = await tx.select({ id: user.id }).from(user).where(eq(user.id, input.userId));
      if (!target) throw new NotFoundException('Usuário não encontrado');
      const [created] = await tx.insert(entitlementGrants).values({
        userId: input.userId,
        planCode: input.planCode,
        entitlements: input.entitlements,
        reason: input.reason,
        grantedBy: actorId,
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
      }).returning();
      await this.audit(tx, actorId, 'grant.created', 'user', input.userId, { grantId: created.id, planCode: input.planCode, reason: input.reason });
      await this.notifications.notify(tx, input.userId, 'grant_received', 'Você recebeu uma cortesia da Ergatis.', '/planos');
      return created;
    });
  }

  async revokeGrant(actorId: string, id: string) {
    return this.db.transaction(async (tx) => {
      const [revoked] = await tx.update(entitlementGrants).set({ revokedAt: new Date(), revokedBy: actorId })
        .where(and(eq(entitlementGrants.id, id), isNull(entitlementGrants.revokedAt))).returning();
      if (!revoked) throw new NotFoundException('Cortesia não encontrada ou já revogada');
      await this.audit(tx, actorId, 'grant.revoked', 'user', revoked.userId, { grantId: id });
      return revoked;
    });
  }

  plans() { return this.db.select().from(plans).orderBy(plans.priceCents); }

  async updatePlan(actorId: string, code: (typeof PLAN_CODES)[number], input: z.infer<typeof planSchema>) {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx.update(plans).set(input).where(eq(plans.code, code)).returning();
      if (!updated) throw new NotFoundException('Plano não encontrado');
      await this.audit(tx, actorId, 'plan.updated', 'plan', code, input);
      return updated;
    });
  }

  subscriptions(page: number) {
    return this.db
      .select({
        id: subscriptions.id, planCode: subscriptions.planCode, status: subscriptions.status,
        provider: subscriptions.provider, currentPeriodEnd: subscriptions.currentPeriodEnd,
        cancelledAt: subscriptions.cancelledAt, createdAt: subscriptions.createdAt,
        userId: user.id, userName: user.name, userEmail: user.email,
      })
      .from(subscriptions).innerJoin(user, eq(user.id, subscriptions.userId))
      .orderBy(desc(subscriptions.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  }

  reports(page: number) {
    return this.db.select().from(reports).orderBy(desc(reports.createdAt))
      .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  }

  async resolveReport(actorId: string, id: string, input: z.infer<typeof reportSchema>) {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx.update(reports).set({ ...input, resolvedBy: actorId }).where(eq(reports.id, id)).returning();
      if (!updated) throw new NotFoundException('Denúncia não encontrada');
      await this.audit(tx, actorId, 'report.updated', 'report', id, input);
      return updated;
    });
  }

  async pendingVerifications() {
    const pending = await this.db.select({ userId: professionals.userId, headline: professionals.headline, name: user.name, email: user.email })
      .from(professionals).innerJoin(user, eq(user.id, professionals.userId))
      .where(eq(professionals.verification, 'pending')).limit(100);
    const documents = pending.length === 0 ? [] : await this.db
      .select({ id: files.id, ownerId: files.ownerId, mimeType: files.mimeType }).from(files)
      .where(and(eq(files.kind, 'verification_document'), inArray(files.ownerId, pending.map((p) => p.userId))));
    return pending.map((p) => ({ ...p, documents: documents.filter((d) => d.ownerId === p.userId) }));
  }

  async decideVerification(actorId: string, id: string, approved: boolean) {
    const result = await this.db.transaction(async (tx) => {
      const [updated] = await tx.update(professionals).set({ verification: approved ? 'approved' : 'rejected' })
        .where(and(eq(professionals.userId, id), eq(professionals.verification, 'pending'))).returning({ id: professionals.userId });
      if (!updated) throw new NotFoundException('Solicitação não encontrada');
      await this.audit(tx, actorId, approved ? 'verification.approved' : 'verification.rejected', 'user', id);
      await this.notifications.notify(tx, id, 'verification_decided', approved ? 'Seu perfil foi verificado.' : 'Sua verificação foi recusada.');
      return { ok: true };
    });
    // Decidido o pedido, não há motivo para manter documento de identidade.
    await this.files.removeAll(id, 'verification_document');
    return result;
  }

  async auditLogs({ page, action, q, targetId }: z.infer<typeof auditListSchema>) {
    const actor = alias(user, 'actor');
    const target = alias(user, 'target');
    const where = and(
      action ? like(auditLogs.action, `${action}%`) : undefined,
      targetId ? eq(auditLogs.targetId, targetId) : undefined,
      q ? or(ilike(actor.email, `%${q}%`), ilike(actor.name, `%${q}%`), ilike(target.email, `%${q}%`), ilike(target.name, `%${q}%`)) : undefined,
    );
    const from = () => this.db.select().from(auditLogs)
      .leftJoin(actor, eq(actor.id, auditLogs.actorId))
      .leftJoin(target, and(eq(auditLogs.targetType, 'user'), eq(sql`${target.id}::text`, auditLogs.targetId)));
    const rows = await from().where(where).orderBy(desc(auditLogs.createdAt))
      .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
    const [{ total }] = await this.db.select({ total: count() }).from(auditLogs)
      .leftJoin(actor, eq(actor.id, auditLogs.actorId))
      .leftJoin(target, and(eq(auditLogs.targetType, 'user'), eq(sql`${target.id}::text`, auditLogs.targetId)))
      .where(where);
    const person = (u: typeof user.$inferSelect | null) => (u ? { id: u.id, name: u.name, email: u.email } : null);
    const items = rows.map((r) => ({
      ...r.audit_logs,
      actor: person(r.actor),
      targetUser: person(r.target),
    }));
    return { items, total, page, pageSize: PAGE_SIZE };
  }
}

@Roles(['admin'])
@SkipAudit('o serviço registra cada ação de admin na mesma transação')
@Controller('admin')
class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('metrics') metrics() { return this.service.metrics(); }
  @Get('users') users(@Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>) { return this.service.users(q); }
  @Get('users/:id') user(@Param('id', ParseUUIDPipe) id: string) { return this.service.userDetail(id); }

  @Post('users/:id/ban')
  ban(@UserId() a: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(banSchema)) b: z.infer<typeof banSchema>) {
    return this.service.ban(a, id, b.reason);
  }

  @Post('users/:id/unban')
  unban(@UserId() a: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.unban(a, id); }

  @Post('users/:id/role')
  role(@UserId() a: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(roleSchema)) b: z.infer<typeof roleSchema>) {
    return this.service.setRole(a, id, b.role);
  }

  @Post('grants')
  grant(@UserId() a: string, @Body(new ZodPipe(grantSchema)) b: GrantInput) { return this.service.grant(a, b); }

  @Delete('grants/:id')
  revoke(@UserId() a: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.revokeGrant(a, id); }

  @Get('plans') plans() { return this.service.plans(); }

  @Patch('plans/:code')
  updatePlan(
    @UserId() a: string,
    @Param('code', new ZodPipe(z.enum(PLAN_CODES))) code: (typeof PLAN_CODES)[number],
    @Body(new ZodPipe(planSchema)) b: z.infer<typeof planSchema>,
  ) { return this.service.updatePlan(a, code, b); }

  @Get('subscriptions')
  subscriptions(@Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>) { return this.service.subscriptions(q.page); }

  @Get('reports')
  reports(@Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>) { return this.service.reports(q.page); }

  @Patch('reports/:id')
  resolve(@UserId() a: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reportSchema)) b: z.infer<typeof reportSchema>) {
    return this.service.resolveReport(a, id, b);
  }

  @Get('verifications') verifications() { return this.service.pendingVerifications(); }

  @Post('verifications/:id')
  decide(@UserId() a: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(verificationSchema)) b: z.infer<typeof verificationSchema>) {
    return this.service.decideVerification(a, id, b.approved);
  }

  @Get('audit-logs')
  audit(@Query(new ZodPipe(auditListSchema)) q: z.infer<typeof auditListSchema>) { return this.service.auditLogs(q); }
}

@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
