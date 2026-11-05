import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { db } from '../src/db/client';
import { categories, user } from '../src/db/schema';

export async function createApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}

export interface Actor { id: string; cookie: string; email: string }

export async function signUp(app: INestApplication, name = 'Pessoa Teste'): Promise<Actor> {
  const email = `${randomUUID()}@teste.dev`;
  const res = await request(app.getHttpServer()).post('/api/auth/sign-up/email')
    .set('Origin', 'http://localhost:3000')
    .send({ name, email, password: 'senha-forte-123' });
  if (res.status !== 200) throw new Error(`sign-up ${res.status}: ${res.text}`);
  const cookie = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
  return { id: res.body.user.id, cookie, email };
}

export async function makeAdmin(actor: Actor) {
  await db.update(user).set({ role: 'admin' }).where(eq(user.id, actor.id));
}

export const api = (app: INestApplication, actor?: Actor) => {
  const agent = request(app.getHttpServer());
  const wrap = (r: request.Test) => (actor ? r.set('Cookie', actor.cookie) : r);
  return {
    get: (p: string) => wrap(agent.get(`/api${p}`)),
    post: (p: string, body?: object | object[]) => wrap(agent.post(`/api${p}`)).send(body),
    patch: (p: string, body?: object) => wrap(agent.patch(`/api${p}`)).send(body),
    put: (p: string, body?: object) => wrap(agent.put(`/api${p}`)).send(body),
    delete: (p: string) => wrap(agent.delete(`/api${p}`)),
  };
};

export async function anyCategoryId() {
  const [row] = await db.select().from(categories).where(eq(categories.slug, 'eletrica'));
  return row.id;
}

export async function makeProfessional(app: INestApplication, name = 'Profissional') {
  const actor = await signUp(app, name);
  const res = await api(app, actor).put('/professionals/me', {
    headline: 'Eletricista experiente', serviceRadiusKm: 30, categoryIds: [await anyCategoryId()],
  });
  if (res.status !== 200) throw new Error(`setup ${res.status}: ${res.text}`);
  return actor;
}

export async function makeRequest(app: INestApplication, client: Actor, title = 'Trocar lâmpada da sala') {
  const res = await api(app, client).post('/requests', {
    categoryId: await anyCategoryId(), title, description: 'Preciso trocar uma lâmpada alta.',
    city: 'Campinas', state: 'SP',
  });
  if (res.status !== 201) throw new Error(`request ${res.status}: ${res.text}`);
  return res.body as { id: string };
}

export const propose = (app: INestApplication, pro: Actor, requestId: string) =>
  api(app, pro).post(`/requests/${requestId}/proposals`, { amountCents: 15000, message: 'Posso fazer amanhã.' });

/** Percorre o fluxo inteiro até a conclusão. */
export async function completeJob(app: INestApplication, client: Actor, pro: Actor) {
  const req = await makeRequest(app, client, 'Serviço concluído de teste');
  const proposal = (await propose(app, pro, req.id)).body;
  const engagement = (await api(app, client).post(`/proposals/${proposal.id}/accept`)).body;
  await api(app, client).post(`/engagements/${engagement.id}/complete`);
  return { req, proposal, engagement };
}
