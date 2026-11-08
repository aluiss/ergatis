import {
  ConflictException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { SubscribeInput } from '@ergatis/shared';
import { recordAudit } from '../audit/audit';
import { InjectDb } from '../common/db.module';
import { isUniqueViolation } from '../common/pg-errors';
import { env } from '../config/env';
import type { Db } from '../db/client';
import { billingEvents, plans, subscriptions, user } from '../db/schema';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BILLING_PROVIDER, type BillingProvider } from './provider';

/** Tolerância para atraso de compensação antes de os benefícios caírem. */
const GRACE_DAYS = 3;

export interface AsaasWebhook {
  id?: string;
  event?: string;
  payment?: { subscription?: string | null; dueDate?: string };
  subscription?: { id?: string };
}

function periodEndFrom(dueDate: string | undefined): Date {
  const end = dueDate ? new Date(`${dueDate}T00:00:00-03:00`) : new Date();
  end.setMonth(end.getMonth() + 1);
  end.setDate(end.getDate() + GRACE_DAYS);
  return end;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    private readonly entitlements: EntitlementsService,
    private readonly notifications: NotificationsService,
  ) {}

  plans() {
    return this.db.select().from(plans).where(eq(plans.active, true)).orderBy(asc(plans.priceCents));
  }

  private live(userId: string) {
    return this.db.select().from(subscriptions).where(and(
      eq(subscriptions.userId, userId),
      inArray(subscriptions.status, ['pending', 'active', 'past_due']),
    ));
  }

  async status(userId: string) {
    const [subscription] = await this.live(userId);
    const access = await this.entitlements.forUser(userId);
    return { ...access, subscription: subscription ?? null };
  }

  async subscribe(userId: string, input: SubscribeInput) {
    const [plan] = await this.db.select().from(plans)
      .where(and(eq(plans.code, input.planCode), eq(plans.active, true)));
    if (!plan) throw new NotFoundException('Plano não encontrado');

    const [existing] = await this.live(userId);
    if (existing) {
      const expired = existing.currentPeriodEnd && existing.currentPeriodEnd <= new Date();
      if (!(existing.status === 'pending' || (existing.cancelledAt && expired))) {
        throw new ConflictException('Você já possui uma assinatura. Cancele-a antes de trocar de plano.');
      }
      if (existing.status === 'pending' && existing.providerSubscriptionId) {
        await this.provider.cancelSubscription(existing.providerSubscriptionId);
      }
      await this.db.update(subscriptions).set({ status: 'cancelled', cancelledAt: new Date() })
        .where(eq(subscriptions.id, existing.id));
    }

    const [account] = await this.db.select().from(user).where(eq(user.id, userId));
    const created = await this.provider.createSubscription({
      userId, name: account.name, email: account.email, cpfCnpj: input.cpfCnpj,
      planName: plan.name, priceCents: plan.priceCents,
    });

    try {
      const [subscription] = await this.db.insert(subscriptions).values({
        userId,
        planCode: plan.code,
        provider: this.provider.name,
        providerCustomerId: created.customerId,
        providerSubscriptionId: created.subscriptionId,
        status: created.activeImmediately ? 'active' : 'pending',
        currentPeriodEnd: created.activeImmediately ? periodEndFrom(undefined) : null,
      }).returning();
      return { subscription, paymentUrl: created.paymentUrl };
    } catch (error) {
      // Duas requisições simultâneas: desfaz a cobrança criada no provedor.
      await this.provider.cancelSubscription(created.subscriptionId);
      if (isUniqueViolation(error)) throw new ConflictException('Você já possui uma assinatura.');
      throw error;
    }
  }

  /** Mantém os benefícios até o fim do período já pago. */
  async cancel(userId: string) {
    const [existing] = await this.live(userId);
    if (!existing) throw new NotFoundException('Nenhuma assinatura ativa');
    if (existing.cancelledAt) throw new ConflictException('Assinatura já cancelada');

    if (existing.providerSubscriptionId) await this.provider.cancelSubscription(existing.providerSubscriptionId);
    const [updated] = await this.db.update(subscriptions)
      .set({ cancelledAt: new Date(), status: existing.status === 'pending' ? 'cancelled' : existing.status })
      .where(eq(subscriptions.id, existing.id)).returning();
    return updated;
  }

  assertWebhookToken(token: string | undefined) {
    const expected = Buffer.from(env.ASAAS_WEBHOOK_TOKEN ?? '');
    const received = Buffer.from(token ?? '');
    if (expected.length === 0 || expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new UnauthorizedException();
    }
  }

  async handleAsaasEvent(event: AsaasWebhook) {
    if (!event.id || !event.event) return { ignored: true };
    const { id: eventId, event: type } = event;

    return this.db.transaction(async (tx) => {
      const inserted = await tx.insert(billingEvents)
        .values({ provider: 'asaas', eventId, type, payload: event })
        .onConflictDoNothing().returning({ id: billingEvents.id });
      if (inserted.length === 0) return { duplicate: true };

      const providerId = event.payment?.subscription ?? event.subscription?.id;
      if (!providerId) return { ignored: true };
      const [subscription] = await tx.select().from(subscriptions)
        .where(eq(subscriptions.providerSubscriptionId, providerId)).for('update');
      if (!subscription) {
        this.logger.warn(`Evento ${type} para assinatura desconhecida ${providerId}`);
        return { ignored: true };
      }

      const set = (values: Partial<typeof subscriptions.$inferInsert>) =>
        tx.update(subscriptions).set(values).where(eq(subscriptions.id, subscription.id));

      switch (type) {
        case 'PAYMENT_CONFIRMED':
        case 'PAYMENT_RECEIVED': {
          const end = periodEndFrom(event.payment?.dueDate);
          const later = subscription.currentPeriodEnd && subscription.currentPeriodEnd > end
            ? subscription.currentPeriodEnd : end;
          if (subscription.status === 'cancelled') break;
          await set({ status: 'active', currentPeriodEnd: later });
          await this.notifications.notify(tx, subscription.userId, 'subscription_active', 'Pagamento confirmado. Seu plano está ativo.', '/planos');
          break;
        }
        case 'PAYMENT_OVERDUE':
          if (subscription.status === 'active') {
            await set({ status: 'past_due' });
            await this.notifications.notify(tx, subscription.userId, 'subscription_past_due', 'Sua fatura venceu. Regularize para manter o plano.', '/planos');
          }
          break;
        case 'PAYMENT_REFUNDED':
        case 'SUBSCRIPTION_DELETED':
        case 'SUBSCRIPTION_INACTIVATED':
          // Cancelamento pelo usuário mantém o período pago; o resto encerra agora.
          if (type === 'PAYMENT_REFUNDED' || !subscription.cancelledAt) {
            await set({ status: 'cancelled', cancelledAt: subscription.cancelledAt ?? new Date() });
          }
          break;
      }
      await recordAudit({
        action: 'billing.event_processed', targetType: 'subscription', targetId: subscription.id,
        metadata: { event: type, eventId, userId: subscription.userId },
      }, tx);
      return { processed: true };
    });
  }
}
