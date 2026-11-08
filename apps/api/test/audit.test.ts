import { randomUUID } from 'node:crypto';
import { LEGAL_VERSION } from '@ergatis/shared';
import { type INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { desc, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUDIT_KEY, SKIP_AUDIT_KEY } from '../src/audit/audit.interceptor';
import { db } from '../src/db/client';
import { auditLogs } from '../src/db/schema';
import { AuditRetentionService } from '../src/audit/audit-retention.service';
import { diff, redact } from '../src/audit/audit-policy';
import { api, createApp, makeAdmin, makeOwner, makeRequest, signUp } from './helpers';

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

describe('contexto, diff e política de dados', () => {
  it('liga pelo requestId o cadastro ao e-mail de confirmação, com navegador e papel do autor', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/sign-up/email').set('Origin', ORIGIN).set('User-Agent', 'teste-auditoria/1.0')
      .send({ name: 'Contexto', email: `${randomUUID()}@teste.dev`, password: 'senha-forte-123', termsVersion: LEGAL_VERSION });
    const id = res.body.user.id as string;
    const logs = await logsFor(id);
    const created = logs.find((l) => l.action === 'user.created')!;
    const mail = logs.find((l) => l.action === 'email.not_sent')!;
    expect(created.requestId).toBeTruthy();
    expect(mail.requestId).toBe(created.requestId);
    expect(created.actorRole).toBe('user');
    expect(created.metadata).toMatchObject({ userAgent: 'teste-auditoria/1.0', method: 'POST', route: '/api/auth/sign-up/email' });
  });

  it('grava os campos alterados do perfil, mascarando o telefone', async () => {
    const actor = await signUp(app);
    await api(app, actor).patch('/me', { displayName: 'Nome Novo', phone: '+55 11 99999-1234' });
    const [log] = (await logsFor(actor.id)).filter((l) => l.action === 'profile.updated');
    expect(log.changes).toEqual(expect.arrayContaining([
      { field: 'displayName', from: 'Pessoa Teste', to: 'Nome Novo' },
      { field: 'phone', from: null, to: '***34' },
    ]));
    expect(JSON.stringify(log)).not.toContain('99999');
  });

  it('a mudança de papel guarda de onde veio e para onde foi', async () => {
    const admin = await signUp(app);
    await makeOwner(admin);
    const target = await signUp(app);
    expect((await api(app, admin).post(`/admin/users/${target.id}/role`, { role: 'admin' })).status).toBe(201);
    const [log] = (await logsFor(target.id)).filter((l) => l.action === 'user.role_changed');
    expect(log).toMatchObject({ actorId: admin.id, actorRole: 'owner', changes: [{ field: 'role', from: 'user', to: 'admin' }] });
  });

  it('a política omite segredos e mascara dados pessoais', () => {
    expect(redact({ password: 'x', nested: { accessToken: 'y', phone: '11999998888' }, ok: 1 }))
      .toEqual({ password: '[omitido]', nested: { accessToken: '[omitido]', phone: '***88' }, ok: 1 });
    expect(diff({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual([{ field: 'b', from: 2, to: 3 }]);
    expect(diff({ newPassword: 'a' }, { newPassword: 'b' })).toEqual([{ field: 'newPassword', from: '[omitido]', to: '[omitido]' }]);
  });
});

describe('consulta, exportação e retenção', () => {
  it('filtra pela pessoa (o que fez e o que sofreu) e exporta CSV, auditando a exportação', async () => {
    const admin = await signUp(app);
    await makeAdmin(admin);
    const someone = await signUp(app);
    await api(app, admin).post(`/admin/users/${someone.id}/ban`, { reason: 'Teste de exportação' });

    const list = await api(app, admin).get(`/admin/audit-logs?userId=${someone.id}`);
    const actions = list.body.items.map((i: { action: string }) => i.action);
    expect(actions).toEqual(expect.arrayContaining(['user.created', 'user.banned']));

    const csv = await api(app, admin).get(`/admin/audit-logs/export?userId=${someone.id}`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Usuário banido');
    expect(csv.text).toContain(someone.email);
    const exported = await db.select().from(auditLogs).where(eq(auditLogs.actorId, admin.id));
    expect(exported.map((l) => l.action)).toContain('audit.exported');

    const from = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect((await api(app, admin).get(`/admin/audit-logs?userId=${someone.id}&from=${from}`)).body.total).toBe(0);
    expect((await api(app, admin).get('/admin/audit-logs/export?userId=nao-e-uuid')).status).toBe(400);
  });

  it('o expurgo remove só o que passou do prazo', async () => {
    const actor = await signUp(app);
    const [old] = await db.insert(auditLogs).values({ action: 'auth.signed_in', targetType: 'user', targetId: actor.id, createdAt: new Date('2000-01-01') }).returning();
    const removed = await app.get(AuditRetentionService).purgeExpired();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.id, old.id))).toEqual([]);
    const [{ recent }] = await db.select({ recent: sql<number>`count(*)::int` }).from(auditLogs).where(eq(auditLogs.targetId, actor.id));
    expect(recent).toBeGreaterThan(0);
  });
});

