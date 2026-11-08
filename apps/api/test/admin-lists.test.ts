import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createApp, makeAdmin, makeProfessional, setRole, signUp, type Actor } from './helpers';

let app: INestApplication;
let admin: Actor;
beforeAll(async () => { app = await createApp(); admin = await signUp(app, 'Admin Listas'); await makeAdmin(admin); });
afterAll(async () => { await app.close(); });

describe('listas do admin', () => {
  it('usuários: busca, papel e situação', async () => {
    const tag = randomUUID().slice(0, 8);
    const banned = await signUp(app, `Banido ${tag}`);
    await api(app, admin).post(`/admin/users/${banned.id}/ban`, { reason: 'Teste de filtro' });
    const mod = await signUp(app, `Moderadora ${tag}`); await setRole(mod, 'moderacao');

    const byName = (await api(app, admin).get(`/admin/users?q=${tag}`)).body;
    expect(byName.total).toBe(2);
    const onlyBanned = (await api(app, admin).get(`/admin/users?q=${tag}&status=banned`)).body;
    expect(onlyBanned.items.map((u: { id: string }) => u.id)).toEqual([banned.id]);
    const staff = (await api(app, admin).get(`/admin/users?q=${tag}&role=staff`)).body;
    expect(staff.items.map((u: { id: string }) => u.id)).toEqual([mod.id]);
    // `%` digitado é texto, não curinga.
    expect((await api(app, admin).get('/admin/users?q=%25%25%25')).body.total).toBe(0);
    expect((await api(app, admin).get('/admin/users?role=inventado')).status).toBe(400);
  });

  it('denúncias: fila pendente, com nomes e reincidência', async () => {
    const tag = randomUUID().slice(0, 8);
    const target = await signUp(app, `Denunciado ${tag}`);
    const a = await signUp(app); const b = await signUp(app);
    await api(app, a).post('/reports', { targetUserId: target.id, reason: `Cobrou a mais ${tag}` });
    const second = (await api(app, b).post('/reports', { targetUserId: target.id, reason: `Não apareceu ${tag}` })).body;
    await api(app, admin).patch(`/admin/reports/${second.id}`, { status: 'resolved', resolution: 'Advertido' });

    const pending = (await api(app, admin).get(`/admin/reports?q=${tag}&status=pending`)).body;
    expect(pending.total).toBe(1);
    expect(pending.items[0]).toMatchObject({ targetName: `Denunciado ${tag}`, targetReports: 2 });
    expect((await api(app, admin).get(`/admin/reports?q=${tag}`)).body.total).toBe(2);
  });

  it('assinaturas e verificações respondem paginadas', async () => {
    const subs = (await api(app, admin).get('/admin/subscriptions?status=active')).body;
    expect(subs).toMatchObject({ page: 1, pageSize: 25 });
    expect(subs.items.every((s: { status: string }) => s.status === 'active')).toBe(true);
    expect((await api(app, admin).get('/admin/verifications?page=2')).body).toMatchObject({ page: 2, items: expect.any(Array) });
  });
});

describe('histórico por registro', () => {
  it('a permissão segue o tipo do registro, e quem não vê auditoria não vê IP', async () => {
    const reporter = await signUp(app);
    const target = await makeProfessional(app);
    const report = (await api(app, reporter).post('/reports', { targetUserId: target.id, reason: 'Comportamento inadequado no serviço' })).body;
    await api(app, admin).patch(`/admin/reports/${report.id}`, { status: 'reviewing' });
    const mod = await signUp(app); await setRole(mod, 'moderacao');

    const asMod = await api(app, mod).get(`/admin/history/report/${report.id}`);
    expect(asMod.status).toBe(200);
    expect(asMod.body.items.map((i: { action: string }) => i.action)).toEqual(expect.arrayContaining(['report.created', 'report.updated']));
    expect(asMod.body.items.every((i: { metadata: Record<string, unknown> | null }) => !i.metadata?.ip)).toBe(true);

    const asAdmin = await api(app, admin).get(`/admin/history/report/${report.id}`);
    expect(asAdmin.body.items.some((i: { metadata: Record<string, unknown> | null }) => i.metadata?.ip)).toBe(true);

    // Usuário: o que fez e o que sofreu.
    const person = (await api(app, mod).get(`/admin/history/user/${target.id}`)).body;
    expect(person.items.map((i: { action: string }) => i.action)).toEqual(expect.arrayContaining(['user.created', 'professional.profile_updated']));

    expect((await api(app, mod).get('/admin/history/plan/pro')).status).toBe(403);
    expect((await api(app, mod).get(`/admin/history/inventado/${report.id}`)).status).toBe(400);
    const user = await signUp(app);
    expect((await api(app, user).get(`/admin/history/report/${report.id}`)).status).toBe(403);
  });
});
