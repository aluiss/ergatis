import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { auditLogs, user } from '../src/db/schema';
import { api, createApp, makeAdmin, setRole, signUp, type Actor } from './helpers';

let app: INestApplication;
beforeAll(async () => { app = await createApp(); });
afterAll(async () => { await app.close(); });

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'senha-forte-123';
const http = () => request(app.getHttpServer());
const cookiesOf = (res: request.Response) => ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? []).map((c) => c.split(';')[0]).join('; ');

/** TOTP (RFC 6238), como o app autenticador calcula. */
function totp(uri: string, offsetSteps = 0) {
  const secret = new URL(uri).searchParams.get('secret')!;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function enable(actor: Actor) {
  const res = await http().post('/api/auth/two-factor/enable').set('Origin', ORIGIN).set('Cookie', actor.cookie).send({ password: PASSWORD });
  expect(res.status).toBe(200);
  const { totpURI, backupCodes } = res.body as { totpURI: string; backupCodes: string[] };
  expect(new URL(totpURI).searchParams.get('issuer')).toBe('Ergatis');
  return { totpURI, backupCodes };
}

const signIn = (email: string) => http().post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email, password: PASSWORD });
const actions = async (id: string) => (await db.select().from(auditLogs).where(eq(auditLogs.targetId, id))).map((l) => l.action);

describe('login em duas etapas', () => {
  it('só ativa depois de confirmar um código; daí o login pede o segundo fator', async () => {
    const actor = await signUp(app);
    const { totpURI } = await enable(actor);
    // Gerou o segredo, mas ainda não confirmou: login segue só com a senha.
    expect((await db.select({ on: user.twoFactorEnabled }).from(user).where(eq(user.id, actor.id)))[0].on).toBe(false);

    const confirm = await http().post('/api/auth/two-factor/verify-totp').set('Origin', ORIGIN).set('Cookie', actor.cookie).send({ code: totp(totpURI) });
    expect(confirm.status).toBe(200);
    expect((await db.select({ on: user.twoFactorEnabled }).from(user).where(eq(user.id, actor.id)))[0].on).toBe(true);

    const first = await signIn(actor.email);
    expect(first.body.twoFactorRedirect).toBe(true);
    const challenge = cookiesOf(first);
    // Sem o segundo fator, não há sessão.
    expect((await http().get('/api/me').set('Cookie', challenge)).status).toBe(401);

    const wrong = await http().post('/api/auth/two-factor/verify-totp').set('Origin', ORIGIN).set('Cookie', challenge).send({ code: '000000' });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    const ok = await http().post('/api/auth/two-factor/verify-totp').set('Origin', ORIGIN).set('Cookie', challenge).send({ code: totp(totpURI) });
    expect(ok.status).toBe(200);
    expect((await http().get('/api/me').set('Cookie', cookiesOf(ok))).status).toBe(200);

    expect(await actions(actor.id)).toEqual(expect.arrayContaining(['auth.two_factor_enabled', 'auth.two_factor_challenged', 'auth.signed_in']));
    const failed = await db.select().from(auditLogs).where(eq(auditLogs.action, 'auth.two_factor_failed'));
    expect(failed.length).toBeGreaterThan(0);
  });

  it('código de recuperação entra uma vez só, e fica na auditoria', async () => {
    const actor = await signUp(app);
    const { totpURI, backupCodes } = await enable(actor);
    await http().post('/api/auth/two-factor/verify-totp').set('Origin', ORIGIN).set('Cookie', actor.cookie).send({ code: totp(totpURI) });

    const challenge = cookiesOf(await signIn(actor.email));
    const used = await http().post('/api/auth/two-factor/verify-backup-code').set('Origin', ORIGIN).set('Cookie', challenge).send({ code: backupCodes[0] });
    expect(used.status).toBe(200);
    expect(await actions(actor.id)).toContain('auth.backup_code_used');

    const again = cookiesOf(await signIn(actor.email));
    expect((await http().post('/api/auth/two-factor/verify-backup-code').set('Origin', ORIGIN).set('Cookie', again).send({ code: backupCodes[0] })).status).toBeGreaterThanOrEqual(400);
  });

  it('a equipe redefine para quem perdeu o celular; a própria pessoa desativa com a senha', async () => {
    const admin = await signUp(app); await makeAdmin(admin);
    const lost = await signUp(app);
    const { totpURI } = await enable(lost);
    await http().post('/api/auth/two-factor/verify-totp').set('Origin', ORIGIN).set('Cookie', lost.cookie).send({ code: totp(totpURI) });

    expect((await api(app, admin).post(`/admin/users/${lost.id}/two-factor/reset`, { reason: 'Perdeu o celular; identidade confirmada por vídeo' })).status).toBe(201);
    expect((await signIn(lost.email)).body.twoFactorRedirect).toBeUndefined();
    expect((await api(app, admin).get(`/admin/users/${lost.id}`)).body.twoFactorEnabled).toBe(false);
    expect(await actions(lost.id)).toContain('auth.two_factor_reset');
    expect((await api(app, admin).post(`/admin/users/${admin.id}/two-factor/reset`, { reason: 'Teste' })).status).toBe(400);

    const self = await signUp(app);
    const s = await enable(self);
    await http().post('/api/auth/two-factor/verify-totp').set('Origin', ORIGIN).set('Cookie', self.cookie).send({ code: totp(s.totpURI) });
    // Ativar troca a sessão: entra de novo, com o segundo fator, para desativar.
    const challenge = cookiesOf(await signIn(self.email));
    const session = cookiesOf(await http().post('/api/auth/two-factor/verify-totp').set('Origin', ORIGIN).set('Cookie', challenge).send({ code: totp(s.totpURI) }));
    const off = await http().post('/api/auth/two-factor/disable').set('Origin', ORIGIN).set('Cookie', session).send({ password: PASSWORD });
    expect(off.status).toBe(200);
    expect(await actions(self.id)).toContain('auth.two_factor_disabled');
  });

  it('pedir para ativar exige a senha certa', async () => {
    const actor = await signUp(app);
    const res = await http().post('/api/auth/two-factor/enable').set('Origin', ORIGIN).set('Cookie', actor.cookie).send({ password: 'senha-errada-000' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('exigência para a equipe', () => {
  it('equipe sem login em duas etapas não acessa a administração; ativando, acessa', async () => {
    const mod = await signUp(app); await setRole(mod, 'moderacao', { twoFactor: false });
    const blocked = await api(app, mod).get('/admin/reports');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('TWO_FACTOR_REQUIRED');
    expect((await api(app, mod).get('/me/access')).body).toMatchObject({ isStaff: true, mustEnableTwoFactor: true });
    // A conta comum dela segue funcionando.
    expect((await api(app, mod).get('/me')).status).toBe(200);
    const denied = await db.select().from(auditLogs).where(eq(auditLogs.actorId, mod.id));
    expect(denied.some((l) => l.action === 'access.denied' && (l.metadata as { reason?: string }).reason === 'two_factor_required')).toBe(true);

    // Ativa de verdade (a sessão é trocada ao confirmar).
    const { totpURI } = await enable(mod);
    const confirmed = await http().post('/api/auth/two-factor/verify-totp').set('Origin', ORIGIN).set('Cookie', mod.cookie).send({ code: totp(totpURI) });
    const session = cookiesOf(confirmed) || mod.cookie;
    expect((await http().get('/api/admin/reports').set('Cookie', session)).status).toBe(200);
    expect((await http().get('/api/me/access').set('Cookie', session)).body.mustEnableTwoFactor).toBe(false);
  });

  it('com a regra desligada, libera; usuário comum nunca é afetado', async () => {
    const admin = await signUp(app); await makeAdmin(admin);
    const sup = await signUp(app); await setRole(sup, 'suporte', { twoFactor: false });
    expect((await api(app, sup).get('/admin/users')).status).toBe(403);
    expect((await api(app, admin).put('/admin/settings', { requireTwoFactorForStaff: false })).status).toBe(200);
    expect((await api(app, sup).get('/admin/users')).status).toBe(200);
    await api(app, admin).put('/admin/settings', { requireTwoFactorForStaff: true });

    const plain = await signUp(app);
    expect((await api(app, plain).get('/me/access')).body.mustEnableTwoFactor).toBe(false);
  });
});

