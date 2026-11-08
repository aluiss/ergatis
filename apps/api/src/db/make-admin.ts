import { eq } from 'drizzle-orm';
import { db, pool } from './client';
import { recordAudit } from '../audit/audit';
import { user } from './schema';

/** Promove o primeiro administrador. Uso: pnpm --filter @ergatis/api db:make-admin email@exemplo.com */
async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('Informe o e-mail do usuário');
  const [before] = await db.select({ role: user.role }).from(user).where(eq(user.email, email));
  const [updated] = await db.update(user).set({ role: 'admin' }).where(eq(user.email, email)).returning({ id: user.id });
  if (!updated) throw new Error(`Usuário não encontrado: ${email}. Cadastre-se pelo site primeiro.`);
  await recordAudit({ action: 'user.made_admin_cli', targetType: 'user', targetId: updated.id, changes: [{ field: 'role', from: before?.role ?? null, to: 'admin' }] });
  await pool.end();
  console.log(`${email} agora é administrador.`);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await pool.end();
  process.exit(1);
});
