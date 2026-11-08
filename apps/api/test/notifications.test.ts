import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createApp, makeProfessional, makeRequest, propose, signUp } from './helpers';

let app: INestApplication;
beforeAll(async () => { app = await createApp(); });
afterAll(async () => { await app.close(); });

describe('contadores do menu', () => {
  it('conta notificações e mensagens não lidas, e marca todas como lidas', async () => {
    const client = await signUp(app);
    const pro = await makeProfessional(app);
    const req = await makeRequest(app, client);
    expect((await propose(app, pro, req.id)).status).toBe(201);

    const before = (await api(app, client).get('/notifications/unread-count')).body;
    expect(before.notifications).toBeGreaterThanOrEqual(1);

    const [conversation] = (await api(app, pro).get('/conversations')).body;
    await api(app, pro).post(`/conversations/${conversation.id}/messages`, { body: 'Olá, posso ir amanhã?' });
    expect((await api(app, client).get('/notifications/unread-count')).body.messages).toBe(1);
    // Abrir a conversa marca as mensagens como lidas.
    await api(app, client).get(`/conversations/${conversation.id}/messages`);
    expect((await api(app, client).get('/notifications/unread-count')).body.messages).toBe(0);

    expect((await api(app, client).post('/notifications/read-all')).status).toBe(201);
    expect((await api(app, client).get('/notifications/unread-count')).body.notifications).toBe(0);
    // O sender não conta as próprias mensagens.
    expect((await api(app, pro).get('/notifications/unread-count')).body.messages).toBe(0);
  });

  it('exige login', async () => {
    expect((await api(app).get('/notifications/unread-count')).status).toBe(401);
  });
});
