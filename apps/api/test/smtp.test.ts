import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SMTPServer } from 'smtp-server';

const PORT = 54332;
const received: { from: string; to: string; data: string; user?: string }[] = [];

const server = new SMTPServer({
  authOptional: false,
  allowInsecureAuth: true,
  hideSTARTTLS: true,
  onAuth(auth, _session, callback) {
    if (auth.username === 'ergatis' && auth.password === 'senha') callback(null, { user: auth.username });
    else callback(new Error('Credenciais inválidas'));
  },
  onData(stream, session, callback) {
    let data = '';
    stream.on('data', (c: Buffer) => { data += c.toString(); });
    stream.on('end', () => {
      received.push({
        from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
        to: session.envelope.rcptTo[0].address,
        data,
        user: session.user as string | undefined,
      });
      callback();
    });
  },
});

describe('envio SMTP real', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => { server.listen(PORT, 'localhost', () => resolve()); });
    vi.stubEnv('SMTP_HOST', 'localhost');
    vi.stubEnv('SMTP_PORT', String(PORT));
    vi.stubEnv('SMTP_USER', 'ergatis');
    vi.stubEnv('SMTP_PASS', 'senha');
    vi.stubEnv('MAIL_FROM', 'Ergatis <avisos@ergatis.test>');
    vi.resetModules();
  });
  afterAll(async () => { await new Promise<void>((resolve) => { server.close(() => resolve()); }); });

  it('autentica e entrega', async () => {
    const { sendMail } = await import('../src/mail/mail');
    await sendMail('pessoa@teste.dev', 'Nova proposta', 'Conteúdo do aviso');
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ from: 'avisos@ergatis.test', to: 'pessoa@teste.dev', user: 'ergatis' });
    expect(received[0].data).toContain('Subject: Nova proposta');
  });
});
