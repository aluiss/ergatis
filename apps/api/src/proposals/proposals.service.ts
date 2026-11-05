import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, lt, ne, sql } from 'drizzle-orm';
import type { CreateProposalInput } from '@ergatis/shared';
import { InjectDb } from '../common/db.module';
import { isUniqueViolation } from '../common/pg-errors';
import type { Db, Tx } from '../db/client';
import {
  conversations, engagements, professionals, proposals, proposalUsage, serviceRequests,
} from '../db/schema';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Mês de referência no fuso do Brasil, para o limite virar à meia-noite local. */
export function currentPeriod(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  }).formatToParts(now);
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
}

@Injectable()
export class ProposalsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly entitlements: EntitlementsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Incremento condicional em uma instrução só: propostas simultâneas não furam o limite. */
  private async consumeQuota(tx: Tx, professionalId: string, limit: number | null) {
    if (limit === null) return;
    const blocked = () => new ForbiddenException({
      code: 'PROPOSAL_LIMIT_REACHED',
      message: `Você atingiu o limite de ${limit} propostas deste mês. Faça upgrade para enviar sem limite.`,
    });
    if (limit <= 0) throw blocked();

    const consumed = await tx.insert(proposalUsage)
      .values({ professionalId, period: currentPeriod(), used: 1 })
      .onConflictDoUpdate({
        target: [proposalUsage.professionalId, proposalUsage.period],
        set: { used: sql`${proposalUsage.used} + 1` },
        setWhere: lt(proposalUsage.used, limit),
      })
      .returning({ used: proposalUsage.used });
    if (consumed.length === 0) throw blocked();
  }

  async create(professionalId: string, requestId: string, input: CreateProposalInput) {
    try {
      return await this.db.transaction(async (tx) => {
        const [pro] = await tx.select().from(professionals).where(eq(professionals.userId, professionalId));
        if (!pro?.active) throw new ForbiddenException('Crie seu perfil profissional primeiro');

        const [request] = await tx.select().from(serviceRequests)
          .where(eq(serviceRequests.id, requestId)).for('share');
        if (!request) throw new NotFoundException('Pedido não encontrado');
        if (request.status !== 'open') throw new ConflictException('Este pedido não aceita mais propostas');
        if (request.clientId === professionalId) throw new ForbiddenException('Você não pode responder ao próprio pedido');

        const { entitlements } = await this.entitlements.forUser(professionalId, tx);
        await this.consumeQuota(tx, professionalId, entitlements.monthlyProposalLimit);

        const [proposal] = await tx.insert(proposals)
          .values({ requestId, professionalId, ...input }).returning();
        await tx.insert(conversations).values({
          proposalId: proposal.id, clientId: request.clientId, professionalId,
        });
        await this.notifications.notify(
          tx, request.clientId, 'proposal_received', `Nova proposta para: ${request.title}`, `/pedidos/${requestId}`,
        );
        return proposal;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Você já enviou proposta para este pedido');
      throw error;
    }
  }

  mine(professionalId: string) {
    return this.db
      .select({
        id: proposals.id, requestId: proposals.requestId, amountCents: proposals.amountCents,
        message: proposals.message, status: proposals.status, createdAt: proposals.createdAt,
        requestTitle: serviceRequests.title,
      })
      .from(proposals)
      .innerJoin(serviceRequests, eq(serviceRequests.id, proposals.requestId))
      .where(eq(proposals.professionalId, professionalId))
      .orderBy(desc(proposals.createdAt)).limit(100);
  }

  async withdraw(professionalId: string, id: string) {
    const [updated] = await this.db.update(proposals).set({ status: 'withdrawn' })
      .where(and(eq(proposals.id, id), eq(proposals.professionalId, professionalId), eq(proposals.status, 'sent')))
      .returning();
    if (!updated) throw new NotFoundException('Proposta não encontrada ou já respondida');
    return updated;
  }

  /** Lock na linha do pedido: dois aceites simultâneos não geram duas contratações. */
  async accept(clientId: string, id: string) {
    return this.db.transaction(async (tx) => {
      const [proposal] = await tx.select().from(proposals).where(eq(proposals.id, id));
      if (!proposal) throw new NotFoundException('Proposta não encontrada');

      const [request] = await tx.select().from(serviceRequests)
        .where(eq(serviceRequests.id, proposal.requestId)).for('update');
      if (!request || request.clientId !== clientId) throw new NotFoundException('Proposta não encontrada');
      if (request.status !== 'open') throw new ConflictException('Este pedido já foi encerrado');

      const [current] = await tx.select({ status: proposals.status }).from(proposals).where(eq(proposals.id, id));
      if (current.status !== 'sent') throw new ConflictException('Esta proposta não está mais disponível');

      await tx.update(proposals).set({ status: 'accepted' }).where(eq(proposals.id, id));
      const others = await tx.update(proposals).set({ status: 'rejected' })
        .where(and(eq(proposals.requestId, request.id), eq(proposals.status, 'sent'), ne(proposals.id, id)))
        .returning({ professionalId: proposals.professionalId });
      await tx.update(serviceRequests).set({ status: 'hired' }).where(eq(serviceRequests.id, request.id));

      const [engagement] = await tx.insert(engagements).values({
        requestId: request.id, proposalId: id, clientId,
        professionalId: proposal.professionalId, agreedCents: proposal.amountCents,
      }).returning();

      await this.notifications.notify(
        tx, proposal.professionalId, 'proposal_accepted', `Sua proposta foi aceita: ${request.title}`, `/contratacoes`,
      );
      for (const other of others) {
        await this.notifications.notify(tx, other.professionalId, 'proposal_rejected', `Outro profissional foi escolhido: ${request.title}`);
      }
      return engagement;
    });
  }

  async reject(clientId: string, id: string) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select({ proposal: proposals, clientId: serviceRequests.clientId, title: serviceRequests.title })
        .from(proposals).innerJoin(serviceRequests, eq(serviceRequests.id, proposals.requestId))
        .where(eq(proposals.id, id));
      if (!row || row.clientId !== clientId) throw new NotFoundException('Proposta não encontrada');
      if (row.proposal.status !== 'sent') throw new ConflictException('Esta proposta não está mais disponível');

      await tx.update(proposals).set({ status: 'rejected' }).where(eq(proposals.id, id));
      await this.notifications.notify(tx, row.proposal.professionalId, 'proposal_rejected', `Proposta recusada: ${row.title}`);
      return { ok: true };
    });
  }
}
