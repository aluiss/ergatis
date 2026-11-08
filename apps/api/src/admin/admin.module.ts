import {
  BadRequestException, Body, Controller, Delete, Get, Header, Injectable, Module, NotFoundException,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { and, count, desc, eq, gte, ilike, inArray, isNull, like, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import {
  grantSchema, PLAN_CODES, REPORT_STATUSES, AUDIT_ACTIONS, AUDIT_GROUPS, STAFF_ROLES, type AccessLevel, type AccessResource, SUBSCRIPTION_STATUSES, USER_ROLES, auditActionLabel, type AuditActionKey, type AuditGroup, type AuditChange, type GrantInput,
} from '@ergatis/shared';
import { InjectDb } from '../common/db.module';
import { AccessService } from '../access/access.service';
import { RequireAccess, RequireAccessBy } from '../access/require-access';
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
const userListSchema = listSchema.extend({
  /** `staff` = qualquer papel de equipe. */
  role: z.enum([...USER_ROLES, 'staff']).optional(),
  status: z.enum(['active', 'banned']).optional(),
});
const subscriptionListSchema = listSchema.extend({ status: z.enum(SUBSCRIPTION_STATUSES).optional() });
/** `pending` = abertas ou em análise: a fila de trabalho. */
const reportListSchema = listSchema.extend({ status: z.enum([...REPORT_STATUSES, 'pending']).optional() });
/** Busca por trecho; `%` e `_` digitados valem como texto, não como curinga. */
const contains = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
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

/**
 * Quem lê a linha do tempo de cada tipo de registro. Como no Workspace: o histórico
 * de um registro é informação de quem cuida dele, não só de quem vê a auditoria toda.
 */
const HISTORY_ACCESS: Record<string, AccessResource> = {
  user: 'admin.users',
  report: 'admin.reports',
  subscription: 'admin.subscriptions',
  plan: 'admin.plans',
  // Pedidos, propostas e conversas entram em investigação de denúncias.
  service_request: 'admin.reports',
  proposal: 'admin.reports',
  engagement: 'admin.reports',
  conversation: 'admin.reports',
  face_check: 'documents.view',
};
const historyAccess = (req: { params: Record<string, string | string[]> }) => {
  const resource = HISTORY_ACCESS[String(req.params.type)];
  return resource ? { resource, level: (resource === 'documents.view' ? 'edit' : 'view') as AccessLevel } : null;
};
const ORIGIN_FIELDS = ['ip', 'userAgent', 'method', 'route'];

@Injectable()
class AdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly entitlements: EntitlementsService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
    private readonly verification: VerificationService,
    private readonly access: AccessService,
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

  async users({ q, page, role, status }: z.infer<typeof userListSchema>) {
    const where = and(
      q ? or(ilike(user.email, contains(q)), ilike(user.name, contains(q))) : undefined,
      role === 'staff' ? inArray(user.role, [...STAFF_ROLES]) : role ? eq(user.role, role) : undefined,
      status === 'banned' ? eq(user.banned, true) : status === 'active' ? or(isNull(user.banned), eq(user.banned, false)) : undefined,
    );
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

  async subscriptions({ q, page, status }: z.infer<typeof subscriptionListSchema>) {
    const where = and(
      status ? eq(subscriptions.status, status) : undefined,
      q ? or(ilike(user.email, contains(q)), ilike(user.name, contains(q))) : undefined,
    );
    const items = await this.db
      .select({
        id: subscriptions.id, planCode: subscriptions.planCode, status: subscriptions.status,
        provider: subscriptions.provider, currentPeriodEnd: subscriptions.currentPeriodEnd,
        cancelledAt: subscriptions.cancelledAt, createdAt: subscriptions.createdAt,
        userId: user.id, userName: user.name, userEmail: user.email,
      })
      .from(subscriptions).innerJoin(user, eq(user.id, subscriptions.userId)).where(where)
      .orderBy(desc(subscriptions.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
    const [{ total }] = await this.db.select({ total: count() }).from(subscriptions)
      .innerJoin(user, eq(user.id, subscriptions.userId)).where(where);
    return { items, total, page, pageSize: PAGE_SIZE };
  }

  /** Com quem denunciou e quem foi denunciado, para a moderação não abrir cada um. */
  async reports({ q, page, status }: z.infer<typeof reportListSchema>) {
    const reporter = alias(user, 'reporter');
    const target = alias(user, 'reported');
    const where = and(
      status === 'pending' ? inArray(reports.status, ['open', 'reviewing']) : status ? eq(reports.status, status) : undefined,
      q ? or(ilike(reports.reason, contains(q)), ilike(target.name, contains(q)), ilike(target.email, contains(q)), ilike(reporter.name, contains(q))) : undefined,
    );
    const base = () => this.db.select({
      id: reports.id, reason: reports.reason, status: reports.status, resolution: reports.resolution, createdAt: reports.createdAt,
      targetUserId: reports.targetUserId, targetName: target.name, targetEmail: target.email,
      reporterId: reports.reporterId, reporterName: reporter.name,
      // Reincidência: quantas denúncias a mesma pessoa já recebeu.
      targetReports: sql<number>`(select count(*)::int from reports r2 where r2.target_user_id = ${reports.targetUserId})`,
    }).from(reports).innerJoin(target, eq(target.id, reports.targetUserId)).innerJoin(reporter, eq(reporter.id, reports.reporterId));
    const items = await base().where(where).orderBy(desc(reports.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
    const [{ total }] = await this.db.select({ total: count() }).from(reports)
      .innerJoin(target, eq(target.id, reports.targetUserId)).innerJoin(reporter, eq(reporter.id, reports.reporterId)).where(where);
    return { items, total, page, pageSize: PAGE_SIZE };
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

  async pendingVerifications({ q, page }: z.infer<typeof listSchema>) {
    const where = and(
      eq(professionals.verification, 'pending'),
      q ? or(ilike(user.email, contains(q)), ilike(user.name, contains(q))) : undefined,
    );
    // Mais antigas primeiro: é uma fila.
    const pending = await this.db.select({
      userId: professionals.userId, headline: professionals.headline, name: user.name, email: user.email, requestedAt: professionals.updatedAt,
    }).from(professionals).innerJoin(user, eq(user.id, professionals.userId)).where(where)
      .orderBy(professionals.updatedAt).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
    const [{ total }] = await this.db.select({ total: count() }).from(professionals).innerJoin(user, eq(user.id, professionals.userId)).where(where);
    const documents = pending.length === 0 ? [] : await this.db
      .select({ id: files.id, ownerId: files.ownerId, mimeType: files.mimeType }).from(files)
      .where(and(eq(files.kind, 'verification_document'), inArray(files.ownerId, pending.map((p) => p.userId))));
    const face = await this.verification.reviewData(pending.map((p) => p.userId));
    const items = pending.map((p) => ({ ...p, documents: documents.filter((d) => d.ownerId === p.userId), face: face.get(p.userId) ?? null }));
    return { items, total, page, pageSize: PAGE_SIZE };
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
        ilike(actor.email, contains(f.q)), ilike(actor.name, contains(f.q)),
        ilike(target.email, contains(f.q)), ilike(target.name, contains(f.q)),
        ilike(auditLogs.summary, contains(f.q)),
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

  /**
   * Linha do tempo de um registro. Para usuário: o que a pessoa fez e o que fizeram com ela.
   * Sem acesso à auditoria, a origem técnica (IP, navegador, rota) não aparece.
   */
  async history(viewer: { id: string; role: string | null }, type: string, id: string, page: number) {
    const q = this.auditQuery(type === 'user' ? { userId: id } : { targetType: type, targetId: id });
    const rows = await q.select().orderBy(desc(auditLogs.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
    const [{ total }] = await q.total();
    const seesOrigin = await this.access.can(viewer, 'admin.audit');
    const items = rows.map(q.toView).map((r) => (seesOrigin || !r.metadata ? r : {
      ...r,
      metadata: Object.fromEntries(Object.entries(r.metadata as Record<string, unknown>).filter(([k]) => !ORIGIN_FIELDS.includes(k))),
    }));
    return { items, total, page, pageSize: PAGE_SIZE };
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
  @Get('users') @RequireAccess('admin.users') users(@Query(new ZodPipe(userListSchema)) q: z.infer<typeof userListSchema>) { return this.service.users(q); }
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
  subscriptions(@Query(new ZodPipe(subscriptionListSchema)) q: z.infer<typeof subscriptionListSchema>) { return this.service.subscriptions(q); }

  @Get('reports') @RequireAccess('admin.reports')
  reports(@Query(new ZodPipe(reportListSchema)) q: z.infer<typeof reportListSchema>) { return this.service.reports(q); }

  @Patch('reports/:id') @RequireAccess('admin.reports', 'edit')
  resolve(@UserId() a: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reportSchema)) b: z.infer<typeof reportSchema>) {
    return this.service.resolveReport(a, id, b);
  }

  @Get('verifications') @RequireAccess('admin.verifications')
  verifications(@Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>) { return this.service.pendingVerifications(q); }

  @Post('verifications/:id') @RequireAccess('admin.verifications', 'edit')
  decide(@UserId() a: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(verificationSchema)) b: z.infer<typeof verificationSchema>) {
    return this.service.decideVerification(a, id, b.approved);
  }

  @Get('history/:type/:id') @RequireAccessBy(historyAccess)
  history(
    @SessionUser() viewer: { id: string; role: string | null }, @Param('type') type: string,
    @Param('id') id: string, @Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>,
  ) { return this.service.history(viewer, type, id.slice(0, 80), q.page); }

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
