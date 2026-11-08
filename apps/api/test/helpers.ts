import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { LEGAL_VERSION } from '@ergatis/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { db } from '../src/db/client';
import { BIOMETRIC_CONSENT_VERSION } from '@ergatis/shared';
import sharp from 'sharp';
import { categories, faceEnrollments, professionals, user } from '../src/db/schema';

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
    .send({ name, email, password: 'senha-forte-123', termsVersion: LEGAL_VERSION });
  if (res.status !== 200) throw new Error(`sign-up ${res.status}: ${res.text}`);
  const cookie = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
  return { id: res.body.user.id, cookie, email };
}

export async function makeAdmin(actor: Actor) {
  await setRole(actor, 'admin');
}

/** Papéis valem pela sessão: o próximo request já lê o papel novo do banco. */
export async function setRole(actor: Actor, role: string) {
  await db.update(user).set({ role }).where(eq(user.id, actor.id));
}

export const makeOwner = (actor: Actor) => setRole(actor, 'owner');

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

/**
 * Profissional pronto para propor: por padrão já verificado (documento e rosto aprovados),
 * como se tivesse passado pela moderação. `verified: false` para testar o bloqueio.
 */
export async function makeProfessional(app: INestApplication, name = 'Profissional', { verified = true } = {}) {
  const actor = await signUp(app, name);
  const res = await api(app, actor).put('/professionals/me', {
    headline: 'Eletricista experiente', serviceRadiusKm: 30, categoryIds: [await anyCategoryId()],
  });
  if (res.status !== 200) throw new Error(`setup ${res.status}: ${res.text}`);
  if (verified) await markVerified(actor);
  return actor;
}

export async function markVerified(actor: Actor) {
  await db.update(professionals).set({ verification: 'approved' }).where(eq(professionals.userId, actor.id));
  await db.insert(faceEnrollments).values({
    userId: actor.id, consentVersion: BIOMETRIC_CONSENT_VERSION, consentAt: new Date(), provider: 'fake',
    subjectRef: `fake_subject_${actor.id}`, status: 'approved', livenessScore: 0.98, capturedAt: new Date(), decidedAt: new Date(),
  }).onConflictDoNothing();
}

/** Uma "foto da câmera" que o provedor simulado aceita. */
export const selfie = () => sharp({ create: { width: 320, height: 320, channels: 3, background: { r: 200, g: 160, b: 140 } } }).jpeg().toBuffer();

/** Checagem facial pelo fluxo real (provedor simulado): inicia, envia a foto, devolve o id. */
export async function faceCheck(app: INestApplication, actor: Actor, purpose: 'enrollment' | 'proposal', requestId?: string) {
  const start = await api(app, actor).post('/verification/face-checks', { purpose, requestId });
  if (start.status !== 201) return { start, checkId: undefined };
  const done = await request(app.getHttpServer()).post(`/api/verification/face-checks/${start.body.checkId}/complete`)
    .set('Cookie', actor.cookie).attach('capture', await selfie(), { filename: 'camera.jpg', contentType: 'image/jpeg' });
  return { start, done, checkId: start.body.checkId as string };
}

export async function makeRequest(app: INestApplication, client: Actor, title = 'Trocar lâmpada da sala') {
  const res = await api(app, client).post('/requests', {
    categoryId: await anyCategoryId(), title, description: 'Preciso trocar uma lâmpada alta.',
    city: 'Campinas', state: 'SP',
  });
  if (res.status !== 201) throw new Error(`request ${res.status}: ${res.text}`);
  return res.body as { id: string };
}

/** Envia proposta como o app faz: confirma o rosto e manda o id da checagem junto. */
export async function propose(app: INestApplication, pro: Actor, requestId: string, { faceCheck: withCheck = true } = {}) {
  const check = withCheck ? await faceCheck(app, pro, 'proposal', requestId) : null;
  return api(app, pro).post(`/requests/${requestId}/proposals`, {
    amountCents: 15000, message: 'Posso fazer amanhã.', ...(check?.checkId ? { faceCheckId: check.checkId } : {}),
  });
}

/** Percorre o fluxo inteiro até a conclusão. */
export async function completeJob(app: INestApplication, client: Actor, pro: Actor) {
  const req = await makeRequest(app, client, 'Serviço concluído de teste');
  const proposal = (await propose(app, pro, req.id)).body;
  const engagement = (await api(app, client).post(`/proposals/${proposal.id}/accept`)).body;
  await api(app, client).post(`/engagements/${engagement.id}/complete`);
  return { req, proposal, engagement };
}
