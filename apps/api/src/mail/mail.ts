import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { env } from '../config/env';

const logger = new Logger('Mail');

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

export async function sendMail(to: string, subject: string, text: string) {
  if (!transport) {
    if (env.NODE_ENV !== 'test') logger.log(`[sem SMTP] ${subject} -> ${to}\n${text}`);
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
}
