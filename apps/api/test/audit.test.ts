import { randomUUID } from 'node:crypto';
import { LEGAL_VERSION } from '@ergatis/shared';
import { type INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { desc, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUDIT_KEY, SKIP_AUDIT_KEY } from '../src/audit/audit.interceptor';
import { db } from '../src/db/client';
import { auditLogs } from '../src/db/schema';
import { api, createApp, makeAdmin, makeRequest, signUp } from './helpers';

let app: INestApplication;
beforeAll(async () => { app = await createApp(); });
afterAll(async () => { await app.close(); });

const ORIGIN = 'http://localhost:3000';
const logsFor = (targetId: string) =>
  db.select().from(auditLogs).where(eq(auditLogs.targetId, targetId)).orderBy(desc(auditLogs.createdAt));
const actionsFor = async (targetId: string) => (await logsFor(targetId)).map((l) => l.action);

describe('cobertura', () => {
  it('toda rota de escrita declara @Audit ou @SkipAudit', () => {
    const WRITE = new Set([RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE]);
    const missing: string[] = [];
    for (const mod of app.get(ModulesContainer).values()) {
      for (const wrapper of mod.controllers.values()) {
        const cls = wrapper.metatype as (new (...a: unknown[]) => object) | null;
        if (!cls) continue;
        const classSkip = Reflect.getMetadata(SKIP_AUDIT_KEY, cls);
        for (const name of Object.getOwnPropertyNames(cls.prototype)) {
          const handler = (cls.prototype as Record<string, unknown>)[name];
          if (typeof handler !== 'function') continue;
          const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
          if (method === undefined || !WRITE.has(method)) continue;
          if (classSkip || Reflect.getMetadata(SKIP_AUDIT_KEY, handler) || Reflect.getMetadata(AUDIT_KEY, handler)) continue;
          missing.push(`${cls.name}.${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('autenticação e e-mail', () => {
  it('registra cadastro, e-mail de confirmação, login, falha de login e logout', async () => {
    const email = `${randomUUID()}@teste.dev`;
    const http = request(app.getHttpServer());
    const signUpRes = await http.post('/api/auth/sign-up/email').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.9')
      .send({ name: 'Auditada', email, password: 'senha-forte-123', termsVersion: LEGAL_VERSION });
    expect(signUpRes.status).toBe(200);
    const id = signUpRes.body.user.id as string;

    const created = (await logsFor(id)).find((l) => l.action === 'user.created')!;
    expect(created.actorId).toBe(id);
    expect(created.metadata).toMatchObject({ ip: '203.0.113.9', via: '/sign-up/email' });

    const mail = (await logsFor(id)).find((l) => l.action === 'email.not_sent')!;
    expect(mail.metadata).toMatchObject({ subject: 'Confirme seu e-mail' });
    expect(JSON.stringify(mail.metadata)).not.toContain(email); // endereço só mascarado
    expect(JSON.stringify(mail.metadata)).not.toContain('token');

    expect((await http.post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email, password: 'senha-errada-123' })).status).toBe(401);
    const signIn = await http.post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email, password: 'senha-forte-123' });
    expect(signIn.status).toBe(200);
    const cookie = (signIn.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
    expect((await http.post('/api/auth/sign-out').set('Origin', ORIGIN).set('Cookie', cookie).send({})).status).toBe(200);

    const actions = await actionsFor(id);
    expect(actions).toEqual(expect.arrayContaining(['user.created', 'auth.sign_in_failed', 'auth.signed_in', 'auth.signed_out']));
    const failed = (await logsFor(id)).find((l) => l.action === 'auth.sign_in_failed')!;
    expect(failed.actorId).toBeNull();
  });

  it('registra pedido de redefinição de senha e o e-mail correspondente', async () => {
    const actor = await signUp(app);
    const res = await request(app.getHttpServer()).post('/api/auth/request-password-reset').set('Origin', ORIGIN)
      .send({ email: actor.email, redirectTo: '/redefinir-senha' });
    expect(res.status).toBe(200);
    const logs = await logsFor(actor.id);
    expect(logs.map((l) => l.action)).toContain('auth.password_reset_requested');
    expect(logs.some((l) => l.action === 'email.not_sent' && (l.metadata as { subject?: string }).subject === 'Redefinição de senha')).toBe(true);
  });
});

describe('ações de negócio', () => {
  it('registra a ação com autor, alvo e IP', async () => {
    const client = await signUp(app);
    const req = await makeRequest(app, client);
    const [log] = await logsFor(req.id);
    expect(log).toMatchObject({ action: 'service_request.created', actorId: client.id, targetType: 'service_request' });
    expect(log.metadata).toHaveProperty('ip');

    await api(app, client).post(`/requests/${req.id}/cancel`);
    expect(await actionsFor(req.id)).toContain('service_request.cancelled');
  });

  it('não registra ação que falhou', async () => {
    const client = await signUp(app);
    const fake = randomUUID();
    expect((await api(app, client).post(`/requests/${fake}/cancel`)).status).toBe(404);
    expect(await actionsFor(fake)).toEqual([]);
  });

  it('o admin filtra por pessoa e por tipo de ação', async () => {
    const admin = await signUp(app, 'Admin Auditoria');
    await makeAdmin(admin);
    const someone = await signUp(app, 'Pessoa Buscada');
    await api(app, someone).patch('/me', { displayName: 'Pessoa Buscada' });

    const res = await api(app, admin).get(`/admin/audit-logs?${new URLSearchParams({ q: someone.email })}`);
    expect(res.status).toBe(200);
    const actions = res.body.items.map((i: { action: string }) => i.action);
    expect(actions).toEqual(expect.arrayContaining(['user.created', 'profile.updated']));
    expect(res.body.items[0].actor?.email ?? res.body.items[0].targetUser?.email).toBe(someone.email);

    const onlyAuth = await api(app, admin).get(`/admin/audit-logs?${new URLSearchParams({ q: someone.email, action: 'user.' })}`);
    expect(onlyAuth.body.items.every((i: { action: string }) => i.action.startsWith('user.'))).toBe(true);
  });
});
