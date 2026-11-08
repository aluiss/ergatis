import {
  BadRequestException, Body, Controller, Delete, Get, Header, Injectable, Module, NotFoundException,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { and, count, desc, eq, gte, ilike, inArray, isNull, like, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import {
  grantSchema, PLAN_CODES, REPORT_STATUSES, AUDIT_ACTIONS, AUDIT_GROUPS, USER_ROLES, auditActionLabel, type AuditActionKey, type AuditGroup, type AuditChange, type GrantInput,
} from '@ergatis/shared';
import { InjectDb } from '../common/db.module';
import { AccessService } from '../access/access.service';
import { RequireAccess } from '../access/require-access';
import { SessionUser } from '../access/session-user.decorator';
import { recordAudit } from '../audit/audit';
import { VerificationService } from '../verification/verification.service';
import { diff } from '../audit/audit-policy';
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
const auditFilterSchema = z.object({
  /** Ação exata ("auth.signed_in") ou prefixo terminado em ponto ("auth."). */
  action: z.string().trim().max(80).regex(/^[a-z_.]*$/).optional(),
  /** Área do catálogo (acesso, e-mails, cobrança...). */
  group: z.enum(Object.keys(AUDIT_GROUPS) as [AuditGroup, ...AuditGroup[]]).optional(),
  /** Nome ou e-mail de quem fez ou de quem sofreu a ação, ou trecho do resumo. */
  q: z.string().trim().max(120).optional(),
  /** Tudo o que envolve a pessoa: o que ela fez e o que fizeram com ela. */
  userId: z.uuid().optional(),
  actorId: z.uuid().optional(),
  targetType: z.string().trim().max(40).optional(),
  targetId: z.string().trim().max(80).optional(),
  requestId: z.string().trim().max(64).optional(),
  /** Datas ISO. `to` sem hora vale até o fim do dia. */
  from: z.string().date().or(z.iso.datetime()).optional(),
  to: z.string().date().or(z.iso.datetime()).optional(),
});
const auditListSchema = auditFilterSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
});
type AuditFilter = z.infer<typeof auditFilterSchema>;
/** Teto da exportação: acima disso, o filtro está largo demais para virar planilha. */
const AUDIT_EXPORT_LIMIT = 10_000;
const csvCell = (v: unknown) => {
  const text = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Aspas sempre; e um prefixo neutraliza fórmulas (=, +, -, @) ao abrir no Excel.
  return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
};
const banSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const roleSchema = z.object({ role: z.enum(USER_ROLES) });
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
    private readonly verification: VerificationService,
  ) {}

  /** Grava na mesma transação da ação: ou as duas acontecem, ou nenhuma. */
  private audit(tx: DbOrTx, actorId: string, action: AuditActionKey, targetType: string, targetId: string,
    details: { metadata?: Record<string, unknown>; changes?: AuditChange[]; summary?: string } = {}) {
    return recordAudit({ actorId, action, targetType, targetId, ...details }, tx);
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
      const [before] = await tx.select({ banned: user.banned, banReason: user.banReason }).from(user).where(eq(user.id, id));
      const [updated] = await tx.update(user).set({ banned, banReason: reason }).where(eq(user.id, id)).returning({ id: user.id });
      if (!updated) throw new NotFoundException('Usuário não encontrado');
      if (banned) await tx.delete(session).where(eq(session.userId, id));
      await this.audit(tx, actorId, banned ? 'user.banned' : 'user.unbanned', 'user', id, {
        changes: diff(before, { banned, banReason: reason }),
        summary: banned ? `Banido: ${reason}` : 'Banimento removido',
      });
      return { ok: true };
    });
  }

  ban(actorId: string, id: string, reason: string) { return this.setBan(actorId, id, true, reason); }
  unban(actorId: string, id: string) { return this.setBan(actorId, id, false, null); }

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
      await this.audit(tx, actorId, 'grant.created', 'user', input.userId, {
        metadata: { grantId: created.id, planCode: input.planCode, entitlements: input.entitlements, endsAt: input.endsAt },
        summary: `${input.planCode ? `Plano ${input.planCode}` : 'Benefício avulso'}: ${input.reason}`,
      });
      await this.notifications.notify(tx, input.userId, 'grant_received', 'Você recebeu uma cortesia da Ergatis.', '/planos');
      return created;
    });
  }

  async revokeGrant(actorId: string, id: string) {
    return this.db.transaction(async (tx) => {
      const [revoked] = await tx.update(entitlementGrants).set({ revokedAt: new Date(), revokedBy: actorId })
        .where(and(eq(entitlementGrants.id, id), isNull(entitlementGrants.revokedAt))).returning();
      if (!revoked) throw new NotFoundException('Cortesia não encontrada ou já revogada');
      await this.audit(tx, actorId, 'grant.revoked', 'user', revoked.userId, {
        metadata: { grantId: id, planCode: revoked.planCode },
        summary: `Revogada: ${revoked.reason}`,
      });
      return revoked;
    });
  }

  plans() { return this.db.select().from(plans).orderBy(plans.priceCents); }

  async updatePlan(actorId: string, code: (typeof PLAN_CODES)[number], input: z.infer<typeof planSchema>) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(plans).where(eq(plans.code, code));
      const [updated] = await tx.update(plans).set(input).where(eq(plans.code, code)).returning();
      if (!updated) throw new NotFoundException('Plano não encontrado');
      await this.audit(tx, actorId, 'plan.updated', 'plan', code, { changes: diff(before, updated, Object.keys(input)) });
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
      const [before] = await tx.select().from(reports).where(eq(reports.id, id));
      const [updated] = await tx.update(reports).set({ ...input, resolvedBy: actorId }).where(eq(reports.id, id)).returning();
      if (!updated) throw new NotFoundException('Denúncia não encontrada');
      await this.audit(tx, actorId, 'report.updated', 'report', id, { changes: diff(before, updated, Object.keys(input)) });
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
    const face = await this.verification.reviewData(pending.map((p) => p.userId));
    return pending.map((p) => ({ ...p, documents: documents.filter((d) => d.ownerId === p.userId), face: face.get(p.userId) ?? null }));
  }

  async decideVerification(actorId: string, id: string, approved: boolean) {
    const result = await this.db.transaction(async (tx) => {
      const [updated] = await tx.update(professionals).set({ verification: approved ? 'approved' : 'rejected' })
        .where(and(eq(professionals.userId, id), eq(professionals.verification, 'pending'))).returning({ id: professionals.userId });
      if (!updated) throw new NotFoundException('Solicitação não encontrada');
      // Documento e rosto são decididos juntos: aprovar sem rosto cadastrado não vale.
      await this.verification.onDecision(tx, id, approved);
      await this.audit(tx, actorId, approved ? 'verification.approved' : 'verification.rejected', 'user', id);
      await this.notifications.notify(tx, id, 'verification_decided', approved ? 'Seu perfil foi verificado.' : 'Sua verificação foi recusada.');
      return { ok: true };
    });
    // Decidido o pedido, não há motivo para manter documento nem selfie: fica só o resultado.
    await this.files.removeAll(id, 'verification_document');
    await this.files.removeAll(id, 'verification_selfie');
    return result;
  }

  private auditQuery(f: AuditFilter) {
    const actor = alias(user, 'actor');
    const target = alias(user, 'target');
    const endOfDay = (d: string) => (d.length === 10 ? new Date(`${d}T23:59:59.999Z`) : new Date(d));
    const where = and(
      f.action ? (f.action.endsWith('.') ? like(auditLogs.action, `${f.action}%`) : eq(auditLogs.action, f.action)) : undefined,
      f.group ? inArray(auditLogs.action, Object.entries(AUDIT_ACTIONS).filter(([, a]) => a.group === f.group).map(([k]) => k)) : undefined,
      f.actorId ? eq(auditLogs.actorId, f.actorId) : undefined,
      f.userId ? or(eq(auditLogs.actorId, f.userId), and(eq(auditLogs.targetType, 'user'), eq(auditLogs.targetId, f.userId))) : undefined,
      f.targetType ? eq(auditLogs.targetType, f.targetType) : undefined,
      f.targetId ? eq(auditLogs.targetId, f.targetId) : undefined,
      f.requestId ? eq(auditLogs.requestId, f.requestId) : undefined,
      f.from ? gte(auditLogs.createdAt, new Date(f.from)) : undefined,
      f.to ? lte(auditLogs.createdAt, endOfDay(f.to)) : undefined,
      f.q ? or(
        ilike(actor.email, `%${f.q}%`), ilike(actor.name, `%${f.q}%`),
        ilike(target.email, `%${f.q}%`), ilike(target.name, `%${f.q}%`),
        ilike(auditLogs.summary, `%${f.q}%`),
      ) : undefined,
    );
    const select = () => this.db.select().from(auditLogs)
      .leftJoin(actor, eq(actor.id, auditLogs.actorId))
      .leftJoin(target, and(eq(auditLogs.targetType, 'user'), eq(sql`${target.id}::text`, auditLogs.targetId)))
      .where(where);
    const total = () => this.db.select({ total: count() }).from(auditLogs)
      .leftJoin(actor, eq(actor.id, auditLogs.actorId))
      .leftJoin(target, and(eq(auditLogs.targetType, 'user'), eq(sql`${target.id}::text`, auditLogs.targetId)))
      .where(where);
    const person = (u: typeof user.$inferSelect | null) => (u ? { id: u.id, name: u.name, email: u.email } : null);
    const toView = (r: Awaited<ReturnType<typeof select>>[number]) => ({
      ...r.audit_logs, actor: person(r.actor), targetUser: person(r.target),
    });
    return { select, total, toView };
  }

  async auditLogs({ page, ...filter }: z.infer<typeof auditListSchema>) {
    const q = this.auditQuery(filter);
    const rows = await q.select().orderBy(desc(auditLogs.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
    const [{ total }] = await q.total();
    return { items: rows.map(q.toView), total, page, pageSize: PAGE_SIZE };
  }

  /** CSV do recorte filtrado. A própria exportação entra na trilha: é saída de dados pessoais. */
  async exportAuditLogs(actorId: string, filter: AuditFilter) {
    const q = this.auditQuery(filter);
    const [{ total }] = await q.total();
    if (total > AUDIT_EXPORT_LIMIT) {
      throw new BadRequestException(`O filtro traz ${total} registros. Refine para até ${AUDIT_EXPORT_LIMIT} antes de exportar.`);
    }
    const rows = (await q.select().orderBy(desc(auditLogs.createdAt)).limit(AUDIT_EXPORT_LIMIT)).map(q.toView);
    await recordAudit({
      actorId, action: 'audit.exported', targetType: 'audit',
      summary: `${rows.length} registros exportados`, metadata: { filter },
    });
    const header = ['data', 'acao', 'descricao', 'autor', 'papel_do_autor', 'alvo', 'id_do_alvo', 'usuario_alvo', 'resumo', 'alteracoes', 'ip', 'requisicao'];
    const lines = rows.map((r) => [
      r.createdAt.toISOString(), r.action, auditActionLabel(r.action), r.actor?.email ?? 'sistema', r.actorRole,
      r.targetType, r.targetId, r.targetUser?.email, r.summary, r.changes,
      (r.metadata as { ip?: string } | null)?.ip, r.requestId,
    ].map(csvCell).join(','));
    // BOM: sem ele o Excel abre acentos quebrados.
    return `\uFEFF${[header.join(','), ...lines].join('\r\n')}`;
  }
}

@SkipAudit('o serviço registra cada ação de admin na mesma transação')
@Controller('admin')
class AdminController {
  constructor(private readonly service: AdminService, private readonly access: AccessService) {}

  @Get('metrics') @RequireAccess('admin.overview') metrics() { return this.service.metrics(); }
  @Get('users') @RequireAccess('admin.users') users(@Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>) { return this.service.users(q); }
  @Get('users/:id') @RequireAccess('admin.users') user(@Param('id', ParseUUIDPipe) id: string) { return this.service.userDetail(id); }

  @Post('users/:id/ban') @RequireAccess('admin.users', 'edit')
  ban(@UserId() a: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(banSchema)) b: z.infer<typeof banSchema>) {
    return this.service.ban(a, id, b.reason);
  }

  @Post('users/:id/unban') @RequireAccess('admin.users', 'edit')
  unban(@UserId() a: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.unban(a, id); }

  @Post('users/:id/role') @RequireAccess('admin.access', 'edit')
  role(@SessionUser() actor: { id: string; role: string | null }, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(roleSchema)) b: z.infer<typeof roleSchema>) {
    return this.access.setRole(actor, id, b.role);
  }

  @Post('grants') @RequireAccess('grants.manage', 'edit')
  grant(@UserId() a: string, @Body(new ZodPipe(grantSchema)) b: GrantInput) { return this.service.grant(a, b); }

  @Delete('grants/:id') @RequireAccess('grants.manage', 'edit')
  revoke(@UserId() a: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.revokeGrant(a, id); }

  @Get('plans') @RequireAccess('admin.plans') plans() { return this.service.plans(); }

  @Patch('plans/:code') @RequireAccess('admin.plans', 'edit')
  updatePlan(
    @UserId() a: string,
    @Param('code', new ZodPipe(z.enum(PLAN_CODES))) code: (typeof PLAN_CODES)[number],
    @Body(new ZodPipe(planSchema)) b: z.infer<typeof planSchema>,
  ) { return this.service.updatePlan(a, code, b); }

  @Get('subscriptions') @RequireAccess('admin.subscriptions')
  subscriptions(@Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>) { return this.service.subscriptions(q.page); }

  @Get('reports') @RequireAccess('admin.reports')
  reports(@Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>) { return this.service.reports(q.page); }

  @Patch('reports/:id') @RequireAccess('admin.reports', 'edit')
  resolve(@UserId() a: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reportSchema)) b: z.infer<typeof reportSchema>) {
    return this.service.resolveReport(a, id, b);
  }

  @Get('verifications') @RequireAccess('admin.verifications') verifications() { return this.service.pendingVerifications(); }

  @Post('verifications/:id') @RequireAccess('admin.verifications', 'edit')
  decide(@UserId() a: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(verificationSchema)) b: z.infer<typeof verificationSchema>) {
    return this.service.decideVerification(a, id, b.approved);
  }

  @Get('audit-logs') @RequireAccess('admin.audit')
  audit(@Query(new ZodPipe(auditListSchema)) q: z.infer<typeof auditListSchema>) { return this.service.auditLogs(q); }

  @Get('audit-logs/export') @RequireAccess('audit.export', 'edit')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="auditoria.csv"')
  @Header('Cache-Control', 'no-store')
  exportAudit(@UserId() a: string, @Query(new ZodPipe(auditFilterSchema)) q: AuditFilter) { return this.service.exportAuditLogs(a, q); }
}

@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
