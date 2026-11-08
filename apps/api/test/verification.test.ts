import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { auditLogs, faceChecks, faceEnrollments } from '../src/db/schema';
import {
  api, createApp, faceCheck, makeAdmin, makeProfessional, makeRequest, propose, setRole, signUp, type Actor,
} from './helpers';

let app: INestApplication;
let admin: Actor;
let original: unknown;
beforeAll(async () => {
  app = await createApp();
  admin = await signUp(app, 'Admin Regras');
  await makeAdmin(admin);
  original = (await api(app, admin).get('/admin/settings')).body;
});
afterAll(async () => {
  await api(app, admin).put('/admin/settings', original as object);
  await app.close();
});

const settings = (patch: object) => api(app, admin).put('/admin/settings', patch);
const searchIds = async () => ((await api(app).get('/professionals?pageSize=50')).body.items as { userId: string }[]).map((i) => i.userId);

describe('quem pode propor', () => {
  it('sem verificação não envia proposta nem aparece na busca', async () => {
    await settings({ requireVerificationToPropose: true, graceUntil: null, graceForProfessionalsBefore: null });
    const client = await signUp(app);
    const pro = await makeProfessional(app, 'Sem Verificação', { verified: false });
    const req = await makeRequest(app, client);
    const res = await propose(app, pro, req.id, { faceCheck: false });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('VERIFICATION_REQUIRED');
    expect(await searchIds()).not.toContain(pro.id);
    expect((await api(app, pro).get('/verification/me')).body).toMatchObject({ canPropose: false });
  });

  it('verificado precisa de uma checagem facial recente, do mesmo pedido, usada uma vez só', async () => {
    await settings({ requireVerificationToPropose: true, requireFaceCheckPerProposal: true });
    const client = await signUp(app);
    const pro = await makeProfessional(app);
    const [a, b] = [await makeRequest(app, client, 'Pedido A'), await makeRequest(app, client, 'Pedido B')];
    expect(await searchIds()).toContain(pro.id);

    const none = await propose(app, pro, a.id, { faceCheck: false });
    expect(none.body.code).toBe('FACE_CHECK_REQUIRED');

    // Checagem feita para o pedido B não vale para o A.
    const forB = await faceCheck(app, pro, 'proposal', b.id);
    const wrong = await api(app, pro).post(`/requests/${a.id}/proposals`, { amountCents: 9000, message: 'Posso ir hoje.', faceCheckId: forB.checkId });
    expect(wrong.status).toBe(403);

    // Vencida: concluída há mais de 10 minutos.
    const old = await faceCheck(app, pro, 'proposal', a.id);
    await db.update(faceChecks).set({ completedAt: new Date(Date.now() - 11 * 60_000) }).where(eq(faceChecks.id, old.checkId!));
    expect((await api(app, pro).post(`/requests/${a.id}/proposals`, { amountCents: 9000, message: 'Posso ir hoje.', faceCheckId: old.checkId })).status).toBe(403);

    const ok = await faceCheck(app, pro, 'proposal', a.id);
    const sent = await api(app, pro).post(`/requests/${a.id}/proposals`, { amountCents: 9000, message: 'Posso ir hoje.', faceCheckId: ok.checkId });
    expect(sent.status).toBe(201);
    const [used] = await db.select().from(faceChecks).where(eq(faceChecks.id, ok.checkId!));
    expect(used).toMatchObject({ proposalId: sent.body.id });
    expect(used.usedAt).not.toBeNull();
    // A mesma checagem não serve de novo (nem para B).
    expect((await api(app, pro).post(`/requests/${b.id}/proposals`, { amountCents: 9000, message: 'Posso ir hoje.', faceCheckId: ok.checkId })).status).toBe(403);
  });

  it('foto que não passa na prova de vida é recusada e fica na auditoria', async () => {
    const client = await signUp(app);
    const pro = await makeProfessional(app);
    const req = await makeRequest(app, client);
    const start = await api(app, pro).post('/verification/face-checks', { purpose: 'proposal', requestId: req.id });
    const tiny = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const done = await request(app.getHttpServer()).post(`/api/verification/face-checks/${start.body.checkId}/complete`)
      .set('Cookie', pro.cookie).attach('capture', tiny, { filename: 'x.png', contentType: 'image/png' });
    expect(done.body.status).toBe('failed');
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.actorId, pro.id), eq(auditLogs.action, 'face.check_failed')));
    expect(log).toBeTruthy();
    // Concluída, não se conclui de novo.
    const again = await request(app.getHttpServer()).post(`/api/verification/face-checks/${start.body.checkId}/complete`)
      .set('Cookie', pro.cookie).attach('capture', tiny, { filename: 'x.png', contentType: 'image/png' });
    expect(again.status).toBe(409);
  });
});

describe('regras da plataforma', () => {
  it('carência libera quem já era profissional, sem checagem facial', async () => {
    const client = await signUp(app);
    const pro = await makeProfessional(app, 'Antigo', { verified: false });
    await settings({
      requireVerificationToPropose: true,
      graceForProfessionalsBefore: new Date(Date.now() + 60_000).toISOString(),
      graceUntil: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect((await api(app, pro).get('/verification/me')).body).toMatchObject({ canPropose: true, inGrace: true, faceCheckRequired: false });
    expect((await propose(app, pro, (await makeRequest(app, client)).id, { faceCheck: false })).status).toBe(201);
    expect(await searchIds()).toContain(pro.id);
    await settings({ graceForProfessionalsBefore: null, graceUntil: null });
  });

  it('o admin pode desligar a exigência; quem não tem a permissão não mexe, e a mudança fica na auditoria', async () => {
    const sup = await signUp(app); await setRole(sup, 'suporte');
    expect((await api(app, sup).put('/admin/settings', { requireVerificationToPropose: false })).status).toBe(403);
    expect((await settings({ requireVerificationToPropose: false })).status).toBe(200);
    const client = await signUp(app);
    const pro = await makeProfessional(app, 'Livre', { verified: false });
    expect((await propose(app, pro, (await makeRequest(app, client)).id, { faceCheck: false })).status).toBe(201);
    await settings({ requireVerificationToPropose: true });
    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.actorId, admin.id), eq(auditLogs.action, 'settings.updated')));
    const changes = logs.flatMap((l) => l.changes ?? []);
    expect(changes).toEqual(expect.arrayContaining([
      { field: 'requireVerificationToPropose', from: true, to: false },
      { field: 'requireVerificationToPropose', from: false, to: true },
    ]));
  });
});

describe('consentimento e moderação', () => {
  it('retirar o consentimento apaga o rosto e bloqueia propostas na hora', async () => {
    await settings({ requireVerificationToPropose: true, graceForProfessionalsBefore: null, graceUntil: null });
    const pro = await makeProfessional(app);
    expect((await api(app, pro).get('/verification/me')).body.canPropose).toBe(true);
    expect((await api(app, pro).delete('/verification/consent')).status).toBe(200);
    expect(await db.select().from(faceEnrollments).where(eq(faceEnrollments.userId, pro.id))).toEqual([]);
    expect((await api(app, pro).get('/verification/me')).body).toMatchObject({ canPropose: false, consent: null, verification: 'none' });
  });

  it('recusa da moderação apaga o rosto; a pessoa pode refazer', async () => {
    const pro = await makeProfessional(app, 'Recusado', { verified: false });
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer();
    await request(app.getHttpServer()).post('/api/files').set('Cookie', pro.cookie).field('kind', 'verification_document').attach('file', png, 'rg.png');
    await api(app, pro).post('/verification/consent');
    await faceCheck(app, pro, 'enrollment');
    expect((await api(app, pro).post('/professionals/me/verification')).status).toBe(201);
    expect((await api(app, admin).post(`/admin/verifications/${pro.id}`, { approved: false })).status).toBe(201);
    const [row] = await db.select().from(faceEnrollments).where(eq(faceEnrollments.userId, pro.id));
    expect(row).toMatchObject({ status: 'rejected', subjectRef: null });
    expect((await faceCheck(app, pro, 'enrollment')).done?.body.status).toBe('passed');
  });

  it('a selfie não entra pelo upload comum', async () => {
    const pro = await makeProfessional(app);
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer();
    const res = await request(app.getHttpServer()).post('/api/files').set('Cookie', pro.cookie).field('kind', 'verification_selfie').attach('file', png, 'eu.png');
    expect(res.status).toBe(400);
  });
});
