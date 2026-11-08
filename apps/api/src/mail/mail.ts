import { Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { maskEmail, recordAudit } from '../audit/audit';
import { env } from '../config/env';
import { db } from '../db/client';
import { user } from '../db/schema';

const logger = new Logger('Mail');

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

/**
 * Registra o envio sem o corpo: ele traz links com token de verificação e de senha.
 * O destinatário fica pelo id do usuário; o endereço vai mascarado.
 */
async function auditMail(
  to: string, subject: string, userId: string | undefined,
  action: 'email.sent' | 'email.failed' | 'email.not_sent', error?: string,
) {
  try {
    const recipientId = userId
      ?? (await db.select({ id: user.id }).from(user).where(eq(user.email, to.toLowerCase())))[0]?.id;
    await recordAudit({
      action, targetType: 'user', targetId: recipientId ?? null,
      metadata: { subject, to: maskEmail(to), ...(error ? { error } : {}), ...(transport ? {} : { reason: 'SMTP não configurado' }) },
    });
  } catch (e) {
    logger.error(`Falha ao auditar e-mail "${subject}"`, e instanceof Error ? e.stack : String(e));
  }
}

/** `userId`, quando conhecido, liga o registro de auditoria ao destinatário. */
export async function sendMail(to: string, subject: string, text: string, options: { userId?: string } = {}) {
  if (!transport) {
    if (env.NODE_ENV !== 'test') logger.log(`[sem SMTP] ${subject} -> ${to}\n${text}`);
    await auditMail(to, subject, options.userId, 'email.not_sent');
    return;
  }
  try {
    await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
  } catch (error) {
    await auditMail(to, subject, options.userId, 'email.failed', error instanceof Error ? error.message.slice(0, 300) : String(error));
    throw error;
  }
  await auditMail(to, subject, options.userId, 'email.sent');
}
