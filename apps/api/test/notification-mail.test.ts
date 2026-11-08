import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/client';
import { notifications } from '../src/db/schema';
import { NotificationMailer } from '../src/notifications/notification-mailer';
import { api, createApp, makeAdmin, makeProfessional, makeRequest, propose, signUp } from './helpers';

const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; text: string }[], fail: 0 }));
vi.mock('../src/mail/mail', () => ({
  sendMail: async (to: string, subject: string, text: string) => {
    if (subject === 'Confirme seu e-mail') return;
    if (mail.fail > 0) { mail.fail -= 1; throw new Error('SMTP fora do ar'); }
    mail.sent.push({ to, subject, text });
  },
}));

let app: INestApplication;
let mailer: NotificationMailer;
beforeAll(async () => { app = await createApp(); mailer = app.get(NotificationMailer); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await mailer.runOnce(); mail.sent.length = 0; mail.fail = 0; });

describe('fila de e-mails', () => {
  it('avisa o cliente sobre nova proposta, com link absoluto', async () => {
    const client = await signUp(app);
    const pro = await makeProfessional(app);
    const req = await makeRequest(app, client);
    await propose(app, pro, req.id);

    await mailer.runOnce();
    const message = mail.sent.find((m) => m.to === client.email)!;
    expect(message.subject).toContain('Nova proposta');
    expect(message.text).toContain(`http://localhost:3000/pedidos/${req.id}`);

    mail.sent.length = 0;
    await mailer.runOnce();
    expect(mail.sent).toHaveLength(0);
  });

  it('respeita quem desligou os avisos', async () => {
    const client = await signUp(app);
    await api(app, client).patch('/me', { emailNotifications: false });
    const pro = await makeProfessional(app);
    await propose(app, pro, (await makeRequest(app, client)).id);
    await mailer.runOnce();
    expect(mail.sent.some((m) => m.to === client.email)).toBe(false);
  });

  it('agrupa mensagens da mesma conversa', async () => {
    const client = await signUp(app);
    const pro = await makeProfessional(app);
    await propose(app, pro, (await makeRequest(app, client)).id);
    await mailer.runOnce();
    mail.sent.length = 0;

    const [conversation] = (await api(app, pro).get('/conversations')).body;
    for (const body of ['um', 'dois', 'três']) await api(app, pro).post(`/conversations/${conversation.id}/messages`, { body });
    await mailer.runOnce();
    await api(app, pro).post(`/conversations/${conversation.id}/messages`, { body: 'quatro' });
    await mailer.runOnce();
    expect(mail.sent.filter((m) => m.to === client.email)).toHaveLength(1);
  });

  it('tenta de novo quando o envio falha e não afeta a ação', async () => {
    const client = await signUp(app);
    const pro = await makeProfessional(app);
    mail.fail = 1;
    expect((await propose(app, pro, (await makeRequest(app, client)).id)).status).toBe(201);

    await mailer.runOnce();
    expect(mail.sent).toHaveLength(0);
    await mailer.runOnce();
    expect(mail.sent.filter((m) => m.to === client.email)).toHaveLength(1);
  });

  it('desiste após 5 falhas', async () => {
    const client = await signUp(app);
    const pro = await makeProfessional(app);
    await propose(app, pro, (await makeRequest(app, client)).id);
    mail.fail = 100;
    for (let i = 0; i < 6; i++) await mailer.runOnce();
    mail.fail = 0;
    await mailer.runOnce();
    expect(mail.sent).toHaveLength(0);
    const [row] = await db.select().from(notifications).where(eq(notifications.userId, client.id));
    expect(row.emailAttempts).toBe(5);
  });

  it('não envia avisos antigos, sem e-mail previsto ou a contas banidas', async () => {
    const client = await signUp(app);
    await db.insert(notifications).values([
      { userId: client.id, type: 'proposal_received', title: 'Antiga', createdAt: new Date(Date.now() - 2 * 86_400_000) },
      { userId: client.id, type: 'proposal_rejected', title: 'Só no site' },
    ]);
    await mailer.runOnce();
    expect(mail.sent).toHaveLength(0);

    const admin = await signUp(app);
    await makeAdmin(admin);
    await api(app, admin).post(`/admin/users/${client.id}/ban`, { reason: 'Teste de banimento' });
    await db.insert(notifications).values({ userId: client.id, type: 'proposal_received', title: 'Banido' });
    await mailer.runOnce();
    expect(mail.sent).toHaveLength(0);
  });

  it('duas instâncias simultâneas não enviam em dobro', async () => {
    const client = await signUp(app);
    await db.insert(notifications).values({ userId: client.id, type: 'grant_received', title: 'Uma vez só' });
    await Promise.all([mailer.runOnce(), mailer.runOnce(), mailer.runOnce()]);
    expect(mail.sent.filter((m) => m.subject === 'Uma vez só')).toHaveLength(1);
  });
});
