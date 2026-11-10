import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { categories } from '../src/db/schema';
import { api, createApp, markVerified, propose, signUp, type Actor } from './helpers';

let app: INestApplication;
beforeAll(async () => { app = await createApp(); });
afterAll(async () => { await app.close(); });

/** Categoria só deste teste: o banco é compartilhado, e "pedidos recebidos" conta por categoria. */
async function isolatedCategory() {
  const [parent] = await db.select().from(categories).where(eq(categories.slug, 'reparos-domesticos'));
  const tag = randomUUID().slice(0, 8);
  const [row] = await db.insert(categories).values({ name: `Teste ${tag}`, slug: `teste-${tag}`, parentId: parent.id }).returning();
  return row.id;
}

const publish = async (client: Actor, categoryId: string, title: string) =>
  (await api(app, client).post('/requests', { categoryId, title, description: 'Descrição do pedido de teste.', city: 'Campinas', state: 'SP' })).body as { id: string };

describe('painel inicial', () => {
  it('cliente e profissional veem seus números do período', async () => {
    const categoryId = await isolatedCategory();
    const client = await signUp(app, 'Cliente Painel');
    const pro = await signUp(app, 'Pro Painel');
    await api(app, pro).put('/professionals/me', { title: 'Faz tudo de teste', serviceRadiusKm: 30, categoryIds: [categoryId] });
    await markVerified(pro);

    const done = await publish(client, categoryId, 'Pedido concluído');
    const waiting = await publish(client, categoryId, 'Pedido aberto');
    await publish(client, categoryId, 'Pedido sem proposta');

    const proposal = (await propose(app, pro, done.id)).body;
    await propose(app, pro, waiting.id);
    const engagement = (await api(app, client).post(`/proposals/${proposal.id}/accept`)).body;
    await api(app, client).post(`/engagements/${engagement.id}/complete`);
    const [conversation] = (await api(app, pro).get('/conversations')).body;
    await api(app, pro).post(`/conversations/${conversation.id}/messages`, { body: 'Obrigado pelo serviço!' });

    const c = (await api(app, client).get('/dashboard?period=month')).body;
    expect(c.client).toEqual({ published: 3, inAnalysis: 2, completed: 1, completionRate: 1 / 3 });
    expect(c.professional).toBeNull();
    expect(c.unreadMessages).toBe(1);

    const p = (await api(app, pro).get('/dashboard')).body;
    expect(p.period.key).toBe('month');
    expect(p.professional).toMatchObject({
      received: 3, openNow: 2, inAnalysis: 1, attended: 1, attendanceRate: 1 / 3, earnedCents: 15000,
      proposals: { used: 2, limit: 5 },
    });
    expect(p.client.published).toBe(0);
  });

  it('período inválido é recusado; sem login, não abre', async () => {
    const someone = await signUp(app);
    expect((await api(app, someone).get('/dashboard?period=ontem')).status).toBe(400);
    expect((await api(app).get('/dashboard')).status).toBe(401);
  });
});
