import { z } from 'zod';

// Em produção as variáveis vêm do ambiente; o arquivo é opcional.
try { process.loadEnvFile(); } catch { /* sem .env */ }

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1),
  WEB_URL: z.url(),
  API_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  /** Proxies confiáveis à frente da API. O Next conta como 1; some o balanceador, se houver. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Ergatis <nao-responda@exemplo.com>'),
  BILLING_PROVIDER: z.enum(['fake', 'asaas']).default('fake'),
  ASAAS_BASE_URL: z.url().default('https://api-sandbox.asaas.com/v3'),
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),
}).superRefine((v, ctx) => {
  if (v.NODE_ENV === 'production' && v.BILLING_PROVIDER === 'fake') {
    ctx.addIssue({ code: 'custom', path: ['BILLING_PROVIDER'], message: 'Não use "fake" em produção' });
  }
  if (v.BILLING_PROVIDER === 'asaas' && (!v.ASAAS_API_KEY || !v.ASAAS_WEBHOOK_TOKEN)) {
    ctx.addIssue({ code: 'custom', path: ['ASAAS_API_KEY'], message: 'Informe ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN' });
  }
});

export const env = schema.parse(process.env);
