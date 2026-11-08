import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REQUIRE_ACCESS_KEY } from '../src/access/require-access';
import { db } from '../src/db/client';
import { accessGrants, auditLogs } from '../src/db/schema';
import { api, createApp, makeOwner, makeProfessional, setRole, signUp, type Actor } from './helpers';

let app: INestApplication;
beforeAll(async () => { app = await createApp(); });
afterAll(async () => { await app.close(); });

const staff = async (role: string) => { const a = await signUp(app, `Equipe ${role}`); await setRole(a, role); return a; };

describe('cobertura', () => {
  it('toda rota sob /admin exige uma permissão do catálogo', () => {
    const missing: string[] = [];
    for (const mod of app.get(ModulesContainer).values()) {
      for (const wrapper of mod.controllers.values()) {
        const cls = wrapper.metatype as (new (...a: unknown[]) => object) | null;
        if (!cls) continue;
        const base = String(Reflect.getMetadata(PATH_METADATA, cls) ?? '');
        for (const name of Object.getOwnPropertyNames(cls.prototype)) {
          const handler = (cls.prototype as Record<string, unknown>)[name];
          if (typeof handler !== 'function' || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
          const path = `${base}/${String(Reflect.getMetadata(PATH_METADATA, handler) ?? '')}`.replace(/\/+/g, '/');
          if (!/^\/?admin(\/|$)/.test(path)) continue;
          if (!Reflect.getMetadata(REQUIRE_ACCESS_KEY, handler)) missing.push(`${cls.name}.${name} (${path})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('papéis', () => {
  it('cada papel vê só o seu pacote, e a negativa fica na auditoria', async () => {
    const mod = await staff('moderacao');
    expect((await api(app, mod).get('/admin/verifications')).status).toBe(200);
    expect((await api(app, mod).get('/admin/reports')).status).toBe(200);
    expect((await api(app, mod).get('/admin/plans')).status).toBe(403);
    const denied = await db.select().from(auditLogs).where(and(eq(auditLogs.actorId, mod.id), eq(auditLogs.action, 'access.denied')));
    expect(denied[0]?.metadata).toMatchObject({ resource: 'admin.plans' });

    const fin = await staff('financeiro');
    expect((await api(app, fin).get('/admin/plans')).status).toBe(200);
    expect((await api(app, fin).get('/admin/reports')).status).toBe(403);

    const jur = await staff('juridico');
    expect((await api(app, jur).get('/admin/reports')).status).toBe(200);
    expect((await api(app, jur).get('/admin/audit-logs/export')).status).toBe(200);

    const sup = await staff('suporte');
    expect((await api(app, sup).get('/admin/users')).status).toBe(200);
    expect((await api(app, sup).post(`/admin/users/${mod.id}/ban`, { reason: 'Teste' })).status).toBe(403);

    const me = (await api(app, sup).get('/me/access')).body;
    expect(me).toMatchObject({ role: 'suporte', isStaff: true, isOwner: false });
    expect(me.resources['grants.manage']).toBe('edit');
    const user = await signUp(app);
    expect((await api(app, user).get('/me/access')).body).toMatchObject({ isStaff: false, resources: {} });
    expect((await api(app, user).get('/admin/metrics')).status).toBe(403);
  });

  it('só quem administra o acesso troca papéis, e nunca o próprio', async () => {
    const owner = await signUp(app); await makeOwner(owner);
    const admin = await staff('admin');
    const target = await signUp(app);

    expect((await api(app, admin).post(`/admin/users/${target.id}/role`, { role: 'moderacao' })).status).toBe(403);
    expect((await api(app, owner).post(`/admin/users/${target.id}/role`, { role: 'moderacao' })).status).toBe(201);
    expect((await api(app, target).get('/admin/verifications')).status).toBe(200);
    expect((await api(app, owner).post(`/admin/users/${owner.id}/role`, { role: 'user' })).status).toBe(400);
    expect((await api(app, owner).post(`/admin/users/${target.id}/role`, { role: 'inventado' })).status).toBe(400);
  });
});

describe('concessões', () => {
  it('o proprietário concede; quem recebe o controle de acesso só concede o que tem, e nunca o próprio controle', async () => {
    const owner = await signUp(app); await makeOwner(owner);
    const sup = await staff('suporte');
    const before = (await api(app, sup).get('/admin/audit-logs')).status;
    expect(before).toBe(403);

    // Concessão individual: o suporte passa a ver a auditoria; o resto do papel não muda.
    const res = await api(app, owner).put(`/admin/access/users/${sup.id}/admin.audit`, { level: 'view' });
    expect(res.status).toBe(200);
    expect((await api(app, sup).get('/admin/audit-logs')).status).toBe(200);

    // Delegação: o admin recebe o controle de acesso para editar.
    await api(app, owner).put('/admin/access/roles/admin/admin.access', { level: 'edit' });
    const admin = await staff('admin');
    expect((await api(app, admin).put(`/admin/access/users/${sup.id}/admin.plans`, { level: 'view' })).status).toBe(200);
    expect((await api(app, admin).put(`/admin/access/users/${sup.id}/admin.access`, { level: 'view' })).status).toBe(403);
    expect((await api(app, admin).post(`/admin/users/${sup.id}/role`, { role: 'owner' })).status).toBe(403);

    // Revogar.
    await api(app, owner).put(`/admin/access/users/${sup.id}/admin.audit`, { level: null });
    expect((await api(app, sup).get('/admin/audit-logs')).status).toBe(403);
    const trail = await db.select().from(auditLogs).where(and(eq(auditLogs.targetId, sup.id), eq(auditLogs.action, 'access.revoked')));
    expect(trail.length).toBeGreaterThan(0);

    // Deixa o pacote do admin como estava para os outros testes.
    await api(app, owner).put('/admin/access/roles/admin/admin.access', { level: 'view' });
  });

  it('o pacote inicial de cada papel veio da migração', async () => {
    const rows = await db.select().from(accessGrants).where(eq(accessGrants.role, 'juridico'));
    expect(rows.map((r) => r.resourceKey)).toEqual(expect.arrayContaining(['admin.reports', 'documents.view', 'audit.export']));
  });
});

describe('fronteiras', () => {
  it('as rotas HTTP do plugin admin do Better Auth ficam fechadas, até para o proprietário', async () => {
    const owner = await signUp(app); await makeOwner(owner);
    const victim = await signUp(app);
    const res = await request(app.getHttpServer()).post('/api/auth/admin/set-role')
      .set('Origin', 'http://localhost:3000').set('Cookie', owner.cookie).send({ userId: victim.id, role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('documento de identidade só para quem tem a permissão de documentos', async () => {
    const pro: Actor = await makeProfessional(app);
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
    const up = await request(app.getHttpServer()).post('/api/files').set('Cookie', pro.cookie)
      .field('kind', 'verification_document').attach('file', png, { filename: `${randomUUID()}.png`, contentType: 'image/png' });
    expect(up.status).toBe(201);
    const sup = await staff('suporte');
    const mod = await staff('moderacao');
    expect((await api(app, sup).get(`/files/${up.body.id}`)).status).toBe(404);
    expect((await api(app, mod).get(`/files/${up.body.id}`)).status).toBe(200);
  });
});
