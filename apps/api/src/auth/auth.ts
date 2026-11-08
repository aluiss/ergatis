import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { admin, twoFactor } from 'better-auth/plugins';
import { BRAND } from './brand';
import { eq } from 'drizzle-orm';
import { LEGAL_VERSION } from '@ergatis/shared';
import { maskEmail, recordAudit } from '../audit/audit';
import { getAuditContext } from '../audit/audit-context';
import { env } from '../config/env';
import { db } from '../db/client';
import * as schema from '../db/schema';
import { sendMail } from '../mail/mail';

/**
 * Este login ainda vai pedir o segundo fator? Usa a regra do próprio plugin (que considera
 * aparelho confiável). Ela é interna ao Better Auth: se sumir numa atualização, a
 * auditoria volta a registrar como login comum, sem quebrar nada.
 */
async function needsSecondFactor(ctx: unknown) {
  const c = ctx as { context?: { options?: { plugins?: { id: string; shouldRequireTwoFactor?: (x: unknown) => Promise<boolean> }[] } } } | undefined;
  const plugin = c?.context?.options?.plugins?.find((p) => p.id === 'two-factor');
  if (!plugin?.shouldRequireTwoFactor) return false;
  return plugin.shouldRequireTwoFactor(ctx).catch(() => false);
}

const TWO_FACTOR_VERIFY = new Set(['/two-factor/verify-totp', '/two-factor/verify-otp', '/two-factor/verify-backup-code']);

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
  plugins: [
    admin(),
    // Login em duas etapas: app autenticador (TOTP) como padrão; código por e-mail e códigos
    // de recuperação como saída para quem está sem o celular. 5 tentativas por desafio.
    twoFactor({
      issuer: BRAND,
      otpOptions: {
        sendOTP: async ({ user, otp }) => {
          await sendMail(user.email, `Seu código de acesso ao ${BRAND}`,
            `Seu código é ${otp}. Ele vale por poucos minutos.\n\nSe não foi você tentando entrar, troque sua senha agora: alguém pode tê-la.`,
            { userId: user.id });
        },
      },
    }),
  ],
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

      // Login em duas etapas.
      const returned = ctx.context.returned as { user?: { id?: string } } | undefined;
      const sessionUser = (ctx.context.session as { user?: { id: string; twoFactorEnabled?: boolean | null } } | null | undefined)?.user;
      const who = sessionUser?.id ?? returned?.user?.id ?? null;
      if (ctx.path === '/sign-in/email' && !failed) {
        const id = await userIdByEmail(email);
        const [u] = id ? await db.select({ on: schema.user.twoFactorEnabled }).from(schema.user).where(eq(schema.user.id, id)) : [];
        if (u?.on) {
          // Senha certa. Se o segundo fator nunca vier, a senha pode ter vazado.
          const challenged = await needsSecondFactor(ctx);
          await recordAudit({
            actorId: id, action: challenged ? 'auth.two_factor_challenged' : 'auth.signed_in', targetType: 'user', targetId: id,
            metadata: challenged ? base : { ...base, via: ctx.path, trustedDevice: true },
          });
        }
      } else if (TWO_FACTOR_VERIFY.has(ctx.path)) {
        const method = ctx.path.split('/').pop();
        if (failed) {
          await recordAudit({ actorId: sessionUser?.id ?? null, action: 'auth.two_factor_failed', targetType: 'user', targetId: sessionUser?.id ?? null, metadata: { method, reason } });
        } else if (ctx.path === '/two-factor/verify-backup-code') {
          await recordAudit({ actorId: who, action: 'auth.backup_code_used', targetType: 'user', targetId: who });
        } else if (ctx.path === '/two-factor/verify-totp' && sessionUser && !sessionUser.twoFactorEnabled) {
          // Logado e ainda sem 2FA: é a confirmação da ativação, não um login.
          await recordAudit({ actorId: who, action: 'auth.two_factor_enabled', targetType: 'user', targetId: who });
        }
      } else if (ctx.path === '/two-factor/disable' && !failed && who) {
        await recordAudit({ actorId: who, action: 'auth.two_factor_disabled', targetType: 'user', targetId: who });
      } else if (ctx.path === '/two-factor/generate-backup-codes' && !failed && who) {
        await recordAudit({ actorId: who, action: 'auth.backup_codes_regenerated', targetType: 'user', targetId: who });
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
          // Com login em duas etapas, o plugin cria uma sessão provisória no login por senha e a
          // troca pelo desafio do segundo fator. Quem registra esse caso é o hook `after` do login.
          if (ctx?.path === '/sign-in/email' && !s.impersonatedBy) {
            const [u] = await db.select({ on: schema.user.twoFactorEnabled }).from(schema.user).where(eq(schema.user.id, s.userId));
            if (u?.on) return;
          }
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
