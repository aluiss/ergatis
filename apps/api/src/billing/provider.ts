import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';

export interface CreateSubscriptionArgs {
  userId: string;
  name: string;
  email: string;
  cpfCnpj: string;
  planName: string;
  priceCents: number;
}

export interface CreatedSubscription {
  customerId: string;
  subscriptionId: string;
  /** Página onde o profissional paga. */
  paymentUrl: string | null;
  /** O provedor fake ativa na hora; o Asaas só ativa pelo webhook. */
  activeImmediately: boolean;
}

export interface BillingProvider {
  readonly name: string;
  createSubscription(args: CreateSubscriptionArgs): Promise<CreatedSubscription>;
  cancelSubscription(subscriptionId: string): Promise<void>;
}

export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');

export class FakeBillingProvider implements BillingProvider {
  readonly name = 'fake';

  async createSubscription(): Promise<CreatedSubscription> {
    return {
      customerId: `fake_cus_${randomUUID()}`,
      subscriptionId: `fake_sub_${randomUUID()}`,
      paymentUrl: null,
      activeImmediately: true,
    };
  }

  async cancelSubscription() {}
}

export class AsaasBillingProvider implements BillingProvider {
  readonly name = 'asaas';

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${env.ASAAS_BASE_URL}${path}`, {
      method,
      headers: { access_token: env.ASAAS_API_KEY!, 'Content-Type': 'application/json', 'User-Agent': 'Ergatis' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 400) {
      // Erro de dados do usuário, como CPF inválido: a mensagem do Asaas é útil para ele.
      const data = (await response.json().catch(() => null)) as { errors?: { description?: string }[] } | null;
      throw new BadRequestException(data?.errors?.[0]?.description ?? 'Dados de cobrança inválidos');
    }
    if (!response.ok) throw new Error(`Asaas ${method} ${path}: HTTP ${response.status}`);
    return (await response.json()) as T;
  }

  async createSubscription(args: CreateSubscriptionArgs): Promise<CreatedSubscription> {
    const customer = await this.call<{ id: string }>('POST', '/customers', {
      name: args.name, email: args.email, cpfCnpj: args.cpfCnpj, externalReference: args.userId,
    });
    const subscription = await this.call<{ id: string }>('POST', '/subscriptions', {
      customer: customer.id,
      billingType: 'UNDEFINED',
      value: args.priceCents / 100,
      nextDueDate: new Date().toISOString().slice(0, 10),
      cycle: 'MONTHLY',
      description: `Ergatis ${args.planName}`,
      externalReference: args.userId,
    });
    const payments = await this.call<{ data: { invoiceUrl?: string }[] }>(
      'GET', `/subscriptions/${subscription.id}/payments`,
    );
    return {
      customerId: customer.id,
      subscriptionId: subscription.id,
      paymentUrl: payments.data[0]?.invoiceUrl ?? null,
      activeImmediately: false,
    };
  }

  async cancelSubscription(subscriptionId: string) {
    await this.call('DELETE', `/subscriptions/${subscriptionId}`);
  }
}
