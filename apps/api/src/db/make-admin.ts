import { eq } from 'drizzle-orm';
import { db, pool } from './client';
import { recordAudit } from '../audit/audit';
import { isStaffRole, type StaffRole } from '@ergatis/shared';
import { user } from './schema';

/**
 * Dá um papel de equipe pela linha de comando (padrão: proprietário). Serve para o
 * primeiro acesso, quando ainda não há ninguém para fazer isso pela tela.
 * Uso: pnpm --filter @ergatis/api db:make-admin email@exemplo.com [owner|admin|moderacao|...]
 */
async function main() {
  const email = process.argv[2];
  const role = (process.argv[3] ?? 'owner') as StaffRole;
  if (!email) throw new Error('Informe o e-mail do usuário');
  if (!isStaffRole(role)) throw new Error(`Papel inválido: ${role}`);
  const [before] = await db.select({ role: user.role }).from(user).where(eq(user.email, email));
  const [updated] = await db.update(user).set({ role }).where(eq(user.email, email)).returning({ id: user.id });
  if (!updated) throw new Error(`Usuário não encontrado: ${email}. Cadastre-se pelo site primeiro.`);
  await recordAudit({ action: 'user.made_admin_cli', targetType: 'user', targetId: updated.id, changes: [{ field: 'role', from: before?.role ?? null, to: role }] });
  await pool.end();
  console.log(`${email} agora tem o papel ${role}.`);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await pool.end();
  process.exit(1);
});
