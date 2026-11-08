import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { LEGAL_VERSION } from '@ergatis/shared';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { auditLogs, legalAcceptances } from '../src/db/schema';
import { api, completeJob, createApp, faceCheck, makeAdmin, makeProfessional, signUp, type Actor } from './helpers';

const solid = (width: number, height: number) => sharp({
  create: { width, height, channels: 3, background: { r: 30, g: 90, b: 200 } },
});
const PNG = await solid(32, 32).png().toBuffer();
const JPEG = await solid(32, 32).jpeg().toBuffer();
const CORRUPT_PNG = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(64, 1)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 3)]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');
const UPLOADS = '/tmp/ergatis-test-uploads';

let app: INestApplication;
beforeAll(async () => { app = await createApp(); });
afterAll(async () => { await app.close(); });

const upload = (actor: Actor, kind: string, body: Buffer, filename = 'foto.png', contentType = 'image/png') =>
  request(app.getHttpServer()).post('/api/files').set('Cookie', actor.cookie)
    .field('kind', kind).attach('file', body, { filename, contentType });
const raw = (path: string, actor?: Actor) => {
  const r = request(app.getHttpServer()).get(`/api${path}`);
  return actor ? r.set('Cookie', actor.cookie) : r;
};

describe('aceite legal', () => {
  const signup = (extra: object) => request(app.getHttpServer()).post('/api/auth/sign-up/email')
    .set('Origin', 'http://localhost:3000')
    .send({ name: 'Sem Aceite', email: `${randomUUID()}@teste.dev`, password: 'senha-forte-123', ...extra });

  it('recusa cadastro sem aceite ou com versão antiga', async () => {
    expect((await signup({})).status).toBe(400);
    expect((await signup({ termsVersion: '2000-01-01' })).status).toBe(400);
  });

  it('registra versão e data do aceite', async () => {
    const actor = await signUp(app);
    const rows = await db.select().from(legalAcceptances).where(eq(legalAcceptances.userId, actor.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe(LEGAL_VERSION);
    const exported = (await api(app, actor).get('/me/export')).body;
    expect(exported.legalAcceptances).toHaveLength(1);
  });
});

describe('upload', () => {
  it('exige login', async () => {
    const res = await request(app.getHttpServer()).post('/api/files').field('kind', 'avatar').attach('file', PNG, 'a.png');
    expect(res.status).toBe(401);
  });

  it('recusa arquivo disfarçado, tipo errado e tamanho excessivo', async () => {
    const pro = await makeProfessional(app);
    expect((await upload(pro, 'avatar', HTML, 'foto.png', 'image/png')).status).toBe(400);
    expect((await upload(pro, 'avatar', PDF, 'foto.pdf', 'application/pdf')).status).toBe(400);
    expect((await upload(pro, 'outro', PNG)).status).toBe(400);
    expect((await upload(pro, 'avatar', CORRUPT_PNG)).status).toBe(400);
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    expect((await upload(pro, 'avatar', big)).status).toBe(400);
    const huge = Buffer.concat([PDF, Buffer.alloc(11 * 1024 * 1024)]);
    expect((await upload(pro, 'verification_document', huge, 'a.pdf', 'application/pdf')).status).toBe(413);
  });

  it('não confia no nome enviado', async () => {
    const actor = await signUp(app);
    const res = await upload(actor, 'avatar', PNG, '../../../etc/passwd.png');
    expect(res.status).toBe(201);
    expect(res.body.storageKey).toBeUndefined();
    expect(readdirSync(UPLOADS).every((f) => /^[0-9a-f-]{36}\.(png|jpg|webp|pdf)$/.test(f))).toBe(true);
  });

  it('trocar a foto apaga a anterior e a foto é pública', async () => {
    const pro = await makeProfessional(app);
    const first = (await upload(pro, 'avatar', PNG)).body;
    const second = (await upload(pro, 'avatar', JPEG, 'b.jpg', 'image/jpeg')).body;
    expect((await raw(`/files/${first.id}`)).status).toBe(404);

    const served = await raw(`/files/${second.id}`);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toContain('image/webp');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect((await api(app).get(`/professionals/${pro.id}`)).body.avatarFileId).toBe(second.id);
  });

  it('remove GPS e demais metadados e redimensiona', async () => {
    const pro = await makeProfessional(app);
    const photo = await solid(3000, 2000).withExif({
      IFD0: { Make: 'CameraSecreta' },
      IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '22/1 54/1 0/1' },
    }).jpeg().toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeDefined();

    const file = (await upload(pro, 'portfolio', photo, 'casa.jpg', 'image/jpeg')).body;
    const served = (await raw(`/files/${file.id}`).buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    })).body as Buffer;
    const meta = await sharp(served).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBe(1600);
    expect(served.includes(Buffer.from('CameraSecreta'))).toBe(false);

    const avatar = (await upload(pro, 'avatar', photo, 'eu.jpg', 'image/jpeg')).body;
    const stored = (await raw(`/files/${avatar.id}`).buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    })).body as Buffer;
    expect((await sharp(stored).metadata()).width).toBe(512);
  });

  it('corrige a orientação da foto de celular', async () => {
    const actor = await signUp(app);
    const rotated = await solid(400, 200).withExif({ IFD0: { Orientation: '6' } }).jpeg().toBuffer();
    const file = (await upload(actor, 'avatar', rotated, 'a.jpg', 'image/jpeg')).body;
    expect(file.mimeType).toBe('image/webp');
  });

  it('só o dono apaga', async () => {
    const pro = await makeProfessional(app);
    const other = await signUp(app);
    const file = (await upload(pro, 'portfolio', PNG)).body;
    expect((await api(app, other).delete(`/files/${file.id}`)).status).toBe(404);
    expect((await api(app, pro).delete(`/files/${file.id}`)).status).toBe(200);
  });

  it('portfólio exige perfil profissional e respeita o máximo', async () => {
    const client = await signUp(app);
    expect((await upload(client, 'portfolio', PNG)).status).toBe(403);
    const pro = await makeProfessional(app);
    for (let i = 0; i < 12; i++) expect((await upload(pro, 'portfolio', PNG)).status).toBe(201);
    expect((await upload(pro, 'portfolio', PNG)).status).toBe(409);
  });

  it('Basic não exibe portfólio; Profissional exibe', async () => {
    const pro = await makeProfessional(app);
    const client = await signUp(app);
    await completeJob(app, client, pro);
    await upload(pro, 'portfolio', PNG);
    expect((await api(app).get(`/professionals/${pro.id}`)).body.portfolio).toBeNull();
    await api(app, pro).post('/billing/subscribe', { planCode: 'pro', cpfCnpj: '12345678901' });
    expect((await api(app).get(`/professionals/${pro.id}`)).body.portfolio).toHaveLength(1);
  });
});

describe('verificação com documento', () => {
  it('documento e selfie são privados, a visualização é auditada e eles somem após a decisão', async () => {
    const admin = await signUp(app);
    await makeAdmin(admin);
    const pro = await makeProfessional(app, 'Profissional', { verified: false });
    const stranger = await signUp(app);
    const ask = () => api(app, pro).post('/professionals/me/verification');

    expect((await ask()).status).toBe(400); // sem documento
    const doc = (await upload(pro, 'verification_document', PDF, 'rg.pdf', 'application/pdf')).body;
    expect((await ask()).body.message).toMatch(/biometria/); // sem consentimento
    // Sem consentimento, nem a captura começa.
    expect((await api(app, pro).post('/verification/face-checks', { purpose: 'enrollment' })).status).toBe(403);
    expect((await api(app, pro).post('/verification/consent')).status).toBe(201);
    expect((await ask()).body.message).toMatch(/reconhecimento facial/); // sem rosto
    const enrolled = await faceCheck(app, pro, 'enrollment');
    expect(enrolled.done?.body.status).toBe('passed');
    expect((await ask()).status).toBe(201);

    expect((await raw(`/files/${doc.id}`)).status).toBe(404);
    expect((await raw(`/files/${doc.id}`, stranger)).status).toBe(404);
    const own = await raw(`/files/${doc.id}`, pro);
    expect(own.status).toBe(200);
    expect(own.headers['cache-control']).toContain('no-store');
    expect(own.headers['content-disposition']).toContain('attachment');

    const queue = (await api(app, admin).get('/admin/verifications')).body.items;
    const item = queue.find((v: { userId: string }) => v.userId === pro.id);
    expect(item.documents).toHaveLength(1);
    expect(item.face).toMatchObject({ livenessScore: 0.98 });
    expect(item.face.selfieFileId).toBeTruthy();
    expect((await raw(`/files/${item.face.selfieFileId}`, stranger)).status).toBe(404);
    expect((await raw(`/files/${doc.id}`, admin)).status).toBe(200);
    expect((await raw(`/files/${item.face.selfieFileId}`, admin)).status).toBe(200);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.targetId, pro.id));
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['document.viewed', 'face.enrolled']));

    expect((await api(app, admin).post(`/admin/verifications/${pro.id}`, { approved: true })).status).toBe(201);
    expect((await raw(`/files/${doc.id}`, admin)).status).toBe(404);
    expect((await raw(`/files/${item.face.selfieFileId}`, admin)).status).toBe(404);
    expect((await api(app).get(`/professionals/${pro.id}`)).body.verified).toBe(true);
    expect((await api(app, pro).get('/verification/me')).body).toMatchObject({ canPropose: true, faceCheckRequired: true, face: { status: 'approved' } });
  });

  it('excluir a conta apaga os arquivos do disco', async () => {
    const pro = await makeProfessional(app);
    const before = new Set(readdirSync(UPLOADS));
    await upload(pro, 'avatar', PNG);
    const added = readdirSync(UPLOADS).filter((f) => !before.has(f));
    expect(added).toHaveLength(1);
    expect((await api(app, pro).delete('/me')).status).toBe(200);
    expect(existsSync(`${UPLOADS}/${added[0]}`)).toBe(false);
  });
});
