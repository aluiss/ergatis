import { eq } from 'drizzle-orm';
import { db, pool } from './client';
import { auditLogs, user } from './schema';

/** Promove o primeiro administrador. Uso: pnpm --filter @ergatis/api db:make-admin email@exemplo.com */
async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('Informe o e-mail do usuário');
  const [updated] = await db.update(user).set({ role: 'admin' }).where(eq(user.email, email)).returning({ id: user.id });
  if (!updated) throw new Error(`Usuário não encontrado: ${email}. Cadastre-se pelo site primeiro.`);
  await db.insert(auditLogs).values({ action: 'user.made_admin_cli', targetType: 'user', targetId: updated.id });
  await pool.end();
  console.log(`${email} agora é administrador.`);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await pool.end();
  process.exit(1);
});
