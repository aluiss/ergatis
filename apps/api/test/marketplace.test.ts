import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, completeJob, createApp, makeAdmin, makeProfessional, makeRequest, propose, signUp } from './helpers';

let app: INestApplication;
beforeAll(async () => { app = await createApp(); });
afterAll(async () => { await app.close(); });

const subscribe = (pro: Parameters<typeof api>[1], planCode: string) =>
  api(app, pro).post('/billing/subscribe', { planCode, cpfCnpj: '12345678901' });

describe('fluxo principal', () => {
  it('vai do pedido à avaliação dos dois lados', async () => {
    const client = await signUp(app, 'Cliente');
    const pro = await makeProfessional(app);
    const req = await makeRequest(app, client);

    const feed = await api(app, pro).get('/requests/feed');
    expect(feed.body.map((r: { id: string }) => r.id)).toContain(req.id);

    const proposal = await propose(app, pro, req.id);
    expect(proposal.status).toBe(201);

    const detail = await api(app, client).get(`/requests/${req.id}`);
    expect(detail.body.proposals).toHaveLength(1);

    const engagement = await api(app, client).post(`/proposals/${proposal.body.id}/accept`);
    expect(engagement.status).toBe(201);

    expect((await api(app, pro).post(`/engagements/${engagement.body.id}/review`, { rating: 5 })).status).toBe(403);
    expect((await api(app, pro).post(`/engagements/${engagement.body.id}/complete`)).status).toBe(404);
    expect((await api(app, client).post(`/engagements/${engagement.body.id}/complete`)).status).toBe(201);

    expect((await api(app, client).post(`/engagements/${engagement.body.id}/review`, { rating: 5 })).status).toBe(201);
    expect((await api(app, pro).post(`/engagements/${engagement.body.id}/review`, { rating: 4 })).status).toBe(201);
    expect((await api(app, client).post(`/engagements/${engagement.body.id}/review`, { rating: 1 })).status).toBe(409);
    expect((await api(app, client).post(`/engagements/${engagement.body.id}/review`, { rating: 9 })).status).toBe(400);

    const mine = (await api(app, client).get('/engagements/mine')).body;
    expect(mine[0].reviewedByMe).toBe(true);
    expect((await api(app, pro).get('/me')).body.professional.categoryIds).toHaveLength(1);
  });

  it('impede duas contratações quando dois aceites chegam juntos', async () => {
    const client = await signUp(app);
    const [a, b] = [await makeProfessional(app), await makeProfessional(app)];
    const req = await makeRequest(app, client);
    const pa = (await propose(app, a, req.id)).body;
    const pb = (await propose(app, b, req.id)).body;

    const results = await Promise.all([
      api(app, client).post(`/proposals/${pa.id}/accept`),
      api(app, client).post(`/proposals/${pb.id}/accept`),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('rejeita proposta duplicada e proposta no próprio pedido', async () => {
    const pro = await makeProfessional(app);
    const client = await signUp(app);
    const req = await makeRequest(app, client);
    expect((await propose(app, pro, req.id)).status).toBe(201);
    expect((await propose(app, pro, req.id)).status).toBe(409);

    const own = await makeRequest(app, pro);
    expect((await propose(app, pro, own.id)).status).toBe(403);
  });
});

describe('isolamento entre usuários', () => {
  it('exige login nas rotas privadas', async () => {
    for (const path of ['/me', '/requests/mine', '/conversations', '/notifications', '/billing/me']) {
      expect((await api(app).get(path)).status).toBe(401);
    }
  });

  it('não deixa terceiros agirem sobre dados alheios', async () => {
    const client = await signUp(app);
    const stranger = await signUp(app);
    const pro = await makeProfessional(app);
    const req = await makeRequest(app, client);
    const proposal = (await propose(app, pro, req.id)).body;

    expect((await api(app, stranger).post(`/proposals/${proposal.id}/accept`)).status).toBe(404);
    expect((await api(app, stranger).post(`/proposals/${proposal.id}/reject`)).status).toBe(404);
    expect((await api(app, stranger).post(`/proposals/${proposal.id}/withdraw`)).status).toBe(404);
    expect((await api(app, stranger).post(`/requests/${req.id}/cancel`)).status).toBe(404);

    const conversations = await api(app, client).get('/conversations');
    const conversationId = conversations.body[0].id;
    expect((await api(app, stranger).get(`/conversations/${conversationId}/messages`)).status).toBe(404);
    expect((await api(app, stranger).post(`/conversations/${conversationId}/messages`, { body: 'oi' })).status).toBe(404);
    expect((await api(app, pro).post(`/conversations/${conversationId}/messages`, { body: 'oi' })).status).toBe(201);
    expect((await api(app, client).get(`/conversations/${conversationId}/messages`)).body).toHaveLength(1);
  });

  it('perfil público não expõe dados de contato e o profissional não vê o id do cliente', async () => {
    const pro = await makeProfessional(app);
    await api(app, pro).patch('/me', { phone: '(19) 99999-0000', latitude: -22.9, longitude: -47.06 });
    const body = (await api(app).get(`/professionals/${pro.id}`)).body;
    expect(JSON.stringify(body)).not.toContain('99999');
    expect(body.latitude).toBeUndefined();
    expect(body.email).toBeUndefined();

    const client = await signUp(app);
    const req = await makeRequest(app, client);
    const seen = (await api(app, pro).get(`/requests/${req.id}`)).body;
    expect(seen.clientId).toBeUndefined();
  });

  it('valida o corpo, inclusive campos inesperados não entram', async () => {
    const actor = await signUp(app);
    const res = await api(app, actor).patch('/me', { displayName: 'Novo Nome', userId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(actor.id);
    expect((await api(app, actor).post('/requests', [{ evil: 1 }])).status).toBe(400);
  });
});

describe('planos', () => {
  it('Basic para no limite mensal, inclusive com envios simultâneos', async () => {
    const pro = await makeProfessional(app);
    const client = await signUp(app);
    const requests = [];
    for (let i = 0; i < 8; i++) requests.push(await makeRequest(app, client, `Pedido número ${i}`));

    const results = await Promise.all(requests.map((r) => propose(app, pro, r.id)));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s === 403)).toHaveLength(3);
    expect(results.find((r) => r.status === 403)!.body.code).toBe('PROPOSAL_LIMIT_REACHED');
  });

  it('Basic não exibe serviços realizados; Profissional exibe e remove o limite', async () => {
    const pro = await makeProfessional(app);
    const client = await signUp(app);
    await completeJob(app, client, pro);
    expect((await api(app).get(`/professionals/${pro.id}`)).body.completedServices).toBeNull();

    expect((await subscribe(pro, 'pro')).status).toBe(201);
    const profile = (await api(app).get(`/professionals/${pro.id}`)).body;
    expect(profile.completedServices).toHaveLength(1);
    expect(profile.badge).toBe(false);

    const access = (await api(app, pro).get('/billing/me')).body;
    expect(access.plan).toBe('pro');
    expect(access.entitlements.monthlyProposalLimit).toBeNull();

    for (let i = 0; i < 6; i++) {
      const req = await makeRequest(app, client, `Sem limite número ${i}`);
      expect((await propose(app, pro, req.id)).status).toBe(201);
    }
  });

  it('só Premium vê a nota do cliente, tem selo e aparece primeiro na busca', async () => {
    const client = await signUp(app);
    const reviewer = await makeProfessional(app);
    const { engagement } = await completeJob(app, client, reviewer);
    await api(app, reviewer).post(`/engagements/${engagement.id}/review`, { rating: 4 });

    const basic = await makeProfessional(app, 'Basic');
    const premium = await makeProfessional(app, 'Premium');
    await subscribe(premium, 'premium');
    const req = await makeRequest(app, client);

    const asBasic = (await api(app, basic).get(`/requests/${req.id}`)).body;
    expect(asBasic.clientRating).toBeNull();
    expect(asBasic.clientRatingLocked).toBe(true);

    const asPremium = (await api(app, premium).get(`/requests/${req.id}`)).body;
    expect(asPremium.clientRating).toEqual({ average: 4, total: 1 });

    const search = (await api(app).get('/professionals?pageSize=50')).body;
    expect(search.items[0].highlighted).toBe(true);
    const found = search.items.find((i: { userId: string }) => i.userId === premium.id);
    expect(found.badge).toBe(true);
    expect(search.items.find((i: { userId: string }) => i.userId === basic.id).badge).toBe(false);
  });

  it('cancelamento mantém o plano até o fim do período pago', async () => {
    const pro = await makeProfessional(app);
    await subscribe(pro, 'pro');
    expect((await api(app, pro).post('/billing/cancel')).status).toBe(201);
    expect((await api(app, pro).get('/billing/me')).body.plan).toBe('pro');
    expect((await api(app, pro).post('/billing/cancel')).status).toBe(409);
  });
});

describe('admin e cortesias', () => {
  it('bloqueia quem não é admin', async () => {
    const actor = await signUp(app);
    for (const path of ['/admin/users', '/admin/metrics', '/admin/plans', '/admin/audit-logs']) {
      expect((await api(app, actor).get(path)).status).toBe(403);
      expect((await api(app).get(path)).status).toBe(401);
    }
    expect((await api(app, actor).post('/admin/grants', { userId: actor.id, planCode: 'premium', reason: 'tentativa' })).status).toBe(403);
  });

  it('concede e revoga cortesia, com auditoria', async () => {
    const admin = await signUp(app, 'Admin');
    await makeAdmin(admin);
    const pro = await makeProfessional(app);

    const grant = await api(app, admin).post('/admin/grants', { userId: pro.id, planCode: 'premium', reason: 'Parceiro de lançamento' });
    expect(grant.status).toBe(201);
    expect((await api(app, pro).get('/billing/me')).body.plan).toBe('premium');
    const search = (await api(app).get('/professionals?pageSize=50')).body;
    expect(search.items.find((i: { userId: string }) => i.userId === pro.id).badge).toBe(true);

    expect((await api(app, admin).delete(`/admin/grants/${grant.body.id}`)).status).toBe(200);
    expect((await api(app, pro).get('/billing/me')).body.plan).toBe('basic');

    const logs = (await api(app, admin).get('/admin/audit-logs')).body;
    const actions = logs.map((l: { action: string }) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['grant.created', 'grant.revoked']));
  });

  it('cortesia vencida não vale, e benefício avulso soma ao plano', async () => {
    const admin = await signUp(app);
    await makeAdmin(admin);
    const pro = await makeProfessional(app);
    await api(app, admin).post('/admin/grants', {
      userId: pro.id, planCode: 'premium', reason: 'Já vencida', endsAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect((await api(app, pro).get('/billing/me')).body.plan).toBe('basic');

    await api(app, admin).post('/admin/grants', { userId: pro.id, entitlements: { monthlyProposalLimit: 50 }, reason: 'Limite ampliado' });
    const access = (await api(app, pro).get('/billing/me')).body;
    expect(access.plan).toBe('basic');
    expect(access.entitlements.monthlyProposalLimit).toBe(50);
    expect(access.entitlements.badge).toBe(false);
  });

  it('banir encerra a sessão; admin não altera a si mesmo', async () => {
    const admin = await signUp(app);
    await makeAdmin(admin);
    const target = await signUp(app);
    expect((await api(app, admin).post(`/admin/users/${target.id}/ban`, { reason: 'Fraude comprovada' })).status).toBe(201);
    expect((await api(app, target).get('/me')).status).toBe(401);
    expect((await api(app, admin).post(`/admin/users/${admin.id}/ban`, { reason: 'Teste próprio' })).status).toBe(400);
  });

  it('mudança de preço e limite no plano vale sem deploy', async () => {
    const admin = await signUp(app);
    await makeAdmin(admin);
    const before = (await api(app, admin).get('/admin/plans')).body.find((p: { code: string }) => p.code === 'pro');
    const res = await api(app, admin).patch('/admin/plans/pro', { priceCents: 3990 });
    expect(res.body.priceCents).toBe(3990);
    await api(app, admin).patch('/admin/plans/pro', { priceCents: before.priceCents });
  });
});

describe('escalada de privilégio', () => {
  it('não aceita role no cadastro nem na edição do usuário', async () => {
    const origin = 'http://localhost:3000';
    const server = app.getHttpServer();
    const signup = await request(server).post('/api/auth/sign-up/email').set('Origin', origin)
      .send({ name: 'Evil', email: 'evil-role@teste.dev', password: 'senha-forte-123', role: 'admin' });
    expect(signup.status).toBe(400);

    const actor = await signUp(app);
    const update = await request(server).post('/api/auth/update-user').set('Origin', origin).set('Cookie', actor.cookie)
      .send({ role: 'admin' });
    expect(update.status).toBe(400);
    expect((await api(app, actor).get('/admin/users')).status).toBe(403);
  });

  it('endpoints de admin do Better Auth exigem admin', async () => {
    const actor = await signUp(app);
    const res = await request(app.getHttpServer()).get('/api/auth/admin/list-users').set('Cookie', actor.cookie);
    expect(res.status).toBe(403);
  });
});

describe('LGPD e denúncias', () => {
  it('anonimiza a conta e exporta os dados', async () => {
    const actor = await signUp(app, 'Nome Real');
    const exported = (await api(app, actor).get('/me/export')).body;
    expect(exported.identity.email).toBe(actor.email);

    expect((await api(app, actor).delete('/me')).status).toBe(200);
    expect((await api(app, actor).get('/me')).status).toBe(401);
  });

  it('impede excluir a conta com contratação ativa', async () => {
    const client = await signUp(app);
    const pro = await makeProfessional(app);
    const req = await makeRequest(app, client);
    const proposal = (await propose(app, pro, req.id)).body;
    await api(app, client).post(`/proposals/${proposal.id}/accept`);
    expect((await api(app, client).delete('/me')).status).toBe(409);
  });

  it('registra denúncia e não aceita denunciar a si mesmo', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    expect((await api(app, a).post('/reports', { targetUserId: b.id, reason: 'Comportamento inadequado no chat' })).status).toBe(201);
    expect((await api(app, a).post('/reports', { targetUserId: a.id, reason: 'Comportamento inadequado no chat' })).status).toBe(400);
  });
});
