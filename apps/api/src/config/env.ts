import { z } from 'zod';

// Em produção as variáveis vêm do ambiente; o arquivo é opcional.
try { process.loadEnvFile(); } catch { /* sem .env */ }

/** `VAR=` no .env vale como ausente. */
const blankAsUndefined = <T extends z.ZodType>(type: T) => z.preprocess((v) => (v === '' ? undefined : v), type);

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
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  BILLING_PROVIDER: z.enum(['fake', 'asaas']).default('fake'),
  ASAAS_BASE_URL: z.url().default('https://api-sandbox.asaas.com/v3'),
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),
  /** Usuário criado pelo seed (opcional). Sem SEED_USER e SEED_PASSWORD, o seed não cria usuário. */
  SEED_USER: blankAsUndefined(z.email().optional()),
  SEED_PASSWORD: blankAsUndefined(z.string().min(8).optional()),
  SEED_NAME: blankAsUndefined(z.string().optional()),
  SEED_ROLE: z.enum(['user', 'admin']).default('user'),
}).superRefine((v, ctx) => {
  if (Boolean(v.SEED_USER) !== Boolean(v.SEED_PASSWORD)) {
    ctx.addIssue({ code: 'custom', path: ['SEED_USER'], message: 'Informe SEED_USER e SEED_PASSWORD juntos' });
  }
  if (v.NODE_ENV === 'production' && v.BILLING_PROVIDER === 'fake') {
    ctx.addIssue({ code: 'custom', path: ['BILLING_PROVIDER'], message: 'Não use "fake" em produção' });
  }
  if (v.STORAGE_DRIVER === 's3' && (!v.S3_BUCKET || !v.S3_ACCESS_KEY_ID || !v.S3_SECRET_ACCESS_KEY)) {
    ctx.addIssue({ code: 'custom', path: ['S3_BUCKET'], message: 'Informe S3_BUCKET, S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY' });
  }
  if (v.BILLING_PROVIDER === 'asaas' && (!v.ASAAS_API_KEY || !v.ASAAS_WEBHOOK_TOKEN)) {
    ctx.addIssue({ code: 'custom', path: ['ASAAS_API_KEY'], message: 'Informe ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN' });
  }
});

export const env = schema.parse(process.env);
