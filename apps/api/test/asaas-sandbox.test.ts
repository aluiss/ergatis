import { BadRequestException, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AsaasBillingProvider } from '../src/billing/provider';
import { env } from '../src/config/env';
import { db } from '../src/db/client';
import { subscriptions } from '../src/db/schema';
import { api, createApp, makeProfessional } from './helpers';

/** CPF com dígitos verificadores válidos, gerado para o sandbox. */
function testCpf() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9));
  const digit = (n: number[]) => {
    const sum = n.reduce((acc, d, i) => acc + d * (n.length + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const first = digit(base);
  return [...base, first, digit([...base, first])].join('');
}

const asaas = async (method: string, path: string) => {
  const res = await fetch(`${env.ASAAS_BASE_URL}${path}`, {
    method, headers: { access_token: env.ASAAS_API_KEY!, 'User-Agent': 'Ergatis' },
  });
  return { status: res.status, body: (await res.json()) as any };
};

// Fala com o sandbox real, por isso só roda quando pedido: ASAAS_SANDBOX_TEST=1
describe.runIf(process.env.ASAAS_SANDBOX_TEST === '1')('Asaas sandbox real', () => {
  let app: INestApplication;
  const provider = new AsaasBillingProvider();
  beforeAll(async () => {
    expect(env.ASAAS_BASE_URL).toContain('sandbox');
    app = await createApp();
  });
  afterAll(async () => { await app.close(); });

  it('cria assinatura, ativa o plano com a cobrança real e limpa tudo', async () => {
    const pro = await makeProfessional(app);
    const created = await provider.createSubscription({
      userId: pro.id, name: 'Teste Ergatis Sandbox', email: 'sandbox@example.com',
      cpfCnpj: testCpf(), planName: 'Profissional', priceCents: 2990,
    });

    try {
      expect(created.customerId).toMatch(/^cus_/);
      expect(created.subscriptionId).toMatch(/^sub_/);
      expect(created.paymentUrl).toMatch(/^https:\/\//);

      const payments = await asaas('GET', `/subscriptions/${created.subscriptionId}/payments`);
      expect(payments.status).toBe(200);
      const payment = payments.body.data[0];
      console.log('cobrança real:', { status: payment.status, value: payment.value, billingType: payment.billingType, dueDate: payment.dueDate });
      expect(payment.subscription).toBe(created.subscriptionId);
      expect(payment.value).toBe(29.9);

      await db.insert(subscriptions).values({
        userId: pro.id, planCode: 'pro', status: 'pending', provider: 'asaas',
        providerCustomerId: created.customerId, providerSubscriptionId: created.subscriptionId,
      });
      expect((await api(app, pro).get('/billing/me')).body.plan).toBe('basic');

      const hook = await request(app.getHttpServer()).post('/api/billing/webhooks/asaas')
        .set('asaas-access-token', env.ASAAS_WEBHOOK_TOKEN!)
        .send({ id: `evt_sandbox_${payment.id}`, event: 'PAYMENT_CONFIRMED', payment });
      expect(hook.body).toEqual({ processed: true });
      expect((await api(app, pro).get('/billing/me')).body.plan).toBe('pro');
    } finally {
      await provider.cancelSubscription(created.subscriptionId);
      const removed = await asaas('DELETE', `/customers/${created.customerId}`);
      console.log('limpeza: cliente removido =', removed.body.deleted);
    }

    const after = await asaas('GET', `/subscriptions/${created.subscriptionId}`);
    expect(after.body.deleted === true || after.status === 404).toBe(true);
  });

  it('CPF inválido é recusado pelo Asaas', async () => {
    await expect(provider.createSubscription({
      userId: '00000000-0000-0000-0000-000000000000', name: 'Teste', email: 'sandbox@example.com',
      cpfCnpj: '11111111111', planName: 'Profissional', priceCents: 2990,
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
