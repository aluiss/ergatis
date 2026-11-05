import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { env } from '../config/env';
import { db } from '../db/client';
import * as schema from '../db/schema';
import { sendMail } from '../mail/mail';

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
      await sendMail(user.email, 'Redefinição de senha', `Para redefinir sua senha, acesse: ${url}`);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail(user.email, 'Confirme seu e-mail', `Para confirmar seu e-mail, acesse: ${url}`);
    },
  },
  plugins: [admin()],
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          await db.insert(schema.profiles).values({ userId: created.id, displayName: created.name });
        },
      },
    },
  },
});
