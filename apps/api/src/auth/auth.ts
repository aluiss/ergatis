import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { admin } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { LEGAL_VERSION } from '@ergatis/shared';
import { maskEmail, recordAudit } from '../audit/audit';
import { getAuditContext } from '../audit/audit-context';
import { env } from '../config/env';
import { db } from '../db/client';
import * as schema from '../db/schema';
import { sendMail } from '../mail/mail';

type HeaderSource = { request?: Request; headers?: Headers } | null | undefined;

/**
 * IP do cliente. Dentro de uma requisição, o do contexto de auditoria (`req.ip`, que
 * respeita o `trust proxy`). Fora dela, a mesma regra aplicada ao cabeçalho: cada
 * proxy confiável acrescenta um endereço no fim do x-forwarded-for; o que vem antes
 * pode ser forjado.
 */
export function clientIp(ctx: HeaderSource) {
  const fromContext = getAuditContext()?.ip;
  if (fromContext) return fromContext.slice(0, 64);
  const header = (ctx?.request?.headers ?? ctx?.headers)?.get('x-forwarded-for');
  if (!header) return undefined;
  const chain = header.split(',').map((v) => v.trim()).filter(Boolean);
  const ip = chain[Math.max(0, chain.length - env.TRUST_PROXY_HOPS)];
  return ip?.slice(0, 64);
}

const userIdByEmail = async (email: unknown) => {
  if (typeof email !== 'string') return null;
  const [found] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email.toLowerCase()));
  return found?.id ?? null;
};

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.API_URL,
  basePath: '/api/auth',
  trustedOrigins: [env.WEB_URL],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  advanced: { database: { generateId: 'uuid' } },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: env.NODE_ENV !== 'test',
    sendResetPassword: async ({ user, url }) => {
      await sendMail(user.email, 'Redefinição de senha', `Para redefinir sua senha, acesse: ${url}`, { userId: user.id });
    },
    onPasswordReset: async ({ user }, request) => {
      await recordAudit({
        actorId: user.id, action: 'auth.password_reset', targetType: 'user', targetId: user.id,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail(user.email, 'Confirme seu e-mail', `Para confirmar seu e-mail, acesse: ${url}`, { userId: user.id });
    },
    afterEmailVerification: async (user, request) => {
      await recordAudit({
        actorId: user.id, action: 'auth.email_verified', targetType: 'user', targetId: user.id,
      });
    },
  },
  // Usado só por chamadas internas do servidor (seed). As rotas HTTP do plugin são bloqueadas
  // no hook abaixo: papéis, banimentos e afins passam pelas regras e pela auditoria do Ergatis.
  plugins: [admin()],
  user: {
    additionalFields: {
      termsVersion: { type: 'string', required: true, input: true, returned: false },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // As rotas do plugin admin (/admin/set-role, /admin/ban-user, /admin/impersonate-user...)
      // contornariam as travas e a auditoria do Ergatis. Chamadas internas do servidor
      // (sem requisição, como o seed) continuam funcionando.
      if (ctx.path.startsWith('/admin/') && ctx.request) {
        throw new APIError('FORBIDDEN', { message: 'Use o painel de administração do Ergatis.' });
      }
      // Depois do sign-out a sessão já não existe; o autor é lido antes.
      if (ctx.path !== '/sign-out') return;
      const current = await getSessionFromCtx(ctx).catch(() => null);
      if (current) {
        await recordAudit({
          actorId: current.user.id, action: 'auth.signed_out', targetType: 'user', targetId: current.user.id,
        });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const failed = ctx.context.returned instanceof APIError;
      const email = (ctx.body as { email?: unknown } | undefined)?.email;
      const base = typeof email === 'string' ? { email: maskEmail(email) } : {};
      const reason = failed ? (ctx.context.returned as APIError).body?.code ?? (ctx.context.returned as APIError).status : undefined;

      if (ctx.path === '/sign-in/email' && failed) {
        await recordAudit({
          action: 'auth.sign_in_failed', targetType: 'user', targetId: await userIdByEmail(email),
          metadata: { ...base, reason },
        });
      } else if (ctx.path === '/sign-up/email' && failed) {
        await recordAudit({ action: 'auth.sign_up_failed', targetType: 'user', metadata: { ...base, reason } });
      } else if (ctx.path === '/request-password-reset' && !failed) {
        // A resposta é a mesma exista ou não a conta; a auditoria distingue.
        await recordAudit({
          action: 'auth.password_reset_requested', targetType: 'user', targetId: await userIdByEmail(email), metadata: base,
        });
      } else if (ctx.path === '/reset-password' && failed) {
        await recordAudit({ action: 'auth.password_reset_failed', targetType: 'user', metadata: { reason } });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (candidate) => {
          if ((candidate as { termsVersion?: string }).termsVersion !== LEGAL_VERSION) {
            throw new APIError('BAD_REQUEST', { message: 'Aceite os Termos de Uso e a Política de Privacidade.' });
          }
          return { data: candidate };
        },
        after: async (created, ctx) => {
          const ipAddress = clientIp(ctx);
          await db.insert(schema.profiles).values({ userId: created.id, displayName: created.name });
          await db.insert(schema.legalAcceptances).values({ userId: created.id, version: LEGAL_VERSION, ipAddress });
          // Cadastro pelo site: o autor é a própria pessoa. Pelo admin ou pelo seed, fica sem autor de sessão.
          const viaSignUp = ctx?.path === '/sign-up/email';
          const creator = viaSignUp ? created.id : ((ctx?.context as { session?: { user?: { id?: string } } } | undefined)?.session?.user?.id ?? null);
          await recordAudit({
            actorId: creator, action: 'user.created', targetType: 'user', targetId: created.id,
            metadata: { via: ctx?.path ?? 'servidor', termsVersion: LEGAL_VERSION },
          });
        },
      },
    },
    session: {
      create: {
        after: async (created, ctx) => {
          const s = created as { userId: string; impersonatedBy?: string | null };
          await recordAudit({
            actorId: s.impersonatedBy ?? s.userId,
            action: s.impersonatedBy ? 'auth.impersonation_started' : 'auth.signed_in',
            targetType: 'user', targetId: s.userId,
            metadata: { via: ctx?.path },
          });
        },
      },
    },
  },
});
