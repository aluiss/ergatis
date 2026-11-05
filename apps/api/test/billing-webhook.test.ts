import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { subscriptions } from '../src/db/schema';
import { api, createApp, makeProfessional } from './helpers';

let app: INestApplication;
beforeAll(async () => { app = await createApp(); });
afterAll(async () => { await app.close(); });

const hook = (body: object, token: string | null = 'webhook-token') => {
  const r = request(app.getHttpServer()).post('/api/billing/webhooks/asaas');
  return (token ? r.set('asaas-access-token', token) : r).send(body);
};

async function pendingSubscription(providerSubscriptionId: string) {
  const pro = await makeProfessional(app);
  await db.insert(subscriptions).values({ userId: pro.id, planCode: 'pro', status: 'pending', provider: 'asaas', providerSubscriptionId });
  return pro;
}

describe('webhook do Asaas', () => {
  it('recusa token ausente ou errado', async () => {
    expect((await hook({ id: 'x', event: 'PAYMENT_CONFIRMED' }, null)).status).toBe(401);
    expect((await hook({ id: 'x', event: 'PAYMENT_CONFIRMED' }, 'webhook-tokeX')).status).toBe(401);
  });

  it('pendente não dá benefício; pagamento ativa; evento repetido é ignorado', async () => {
    const pro = await pendingSubscription('sub_a');
    expect((await api(app, pro).get('/billing/me')).body.plan).toBe('basic');

    const dueDate = new Date().toISOString().slice(0, 10);
    const event = { id: 'evt_a', event: 'PAYMENT_CONFIRMED', payment: { subscription: 'sub_a', dueDate } };
    expect((await hook(event)).body).toEqual({ processed: true });
    expect((await api(app, pro).get('/billing/me')).body.plan).toBe('pro');
    expect((await hook(event)).body).toEqual({ duplicate: true });
  });

  it('atraso marca past_due e mantém acesso até o fim do período; estorno encerra', async () => {
    const pro = await pendingSubscription('sub_b');
    const dueDate = new Date().toISOString().slice(0, 10);
    await hook({ id: 'evt_b1', event: 'PAYMENT_RECEIVED', payment: { subscription: 'sub_b', dueDate } });
    await hook({ id: 'evt_b2', event: 'PAYMENT_OVERDUE', payment: { subscription: 'sub_b', dueDate } });

    const status = (await api(app, pro).get('/billing/me')).body;
    expect(status.subscription.status).toBe('past_due');
    expect(status.plan).toBe('pro');

    await hook({ id: 'evt_b3', event: 'PAYMENT_REFUNDED', payment: { subscription: 'sub_b', dueDate } });
    expect((await api(app, pro).get('/billing/me')).body.plan).toBe('basic');
  });

  it('período vencido deixa de valer mesmo sem novo webhook', async () => {
    const pro = await pendingSubscription('sub_c');
    await db.update(subscriptions)
      .set({ status: 'active', currentPeriodEnd: new Date(Date.now() - 60_000) })
      .where(eq(subscriptions.providerSubscriptionId, 'sub_c'));
    expect((await api(app, pro).get('/billing/me')).body.plan).toBe('basic');
  });

  it('assinatura desconhecida não derruba o webhook', async () => {
    const res = await hook({ id: 'evt_z', event: 'PAYMENT_CONFIRMED', payment: { subscription: 'sub_inexistente' } });
    expect(res.status).toBe(200);
  });
});
