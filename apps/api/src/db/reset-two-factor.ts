import { eq } from 'drizzle-orm';
import { recordAudit } from '../audit/audit';
import { db, pool } from './client';
import { session, twoFactor, user } from './schema';

/**
 * Saída de emergência: desativa o login em duas etapas de alguém pela linha de comando,
 * para quando não há mais ninguém da equipe que possa fazer isso pela tela (ex.: o único
 * proprietário perdeu o celular e os códigos). Exige acesso ao servidor e fica na auditoria.
 * Uso: pnpm --filter @ergatis/api db:reset-2fa email@exemplo.com "como a identidade foi confirmada"
 */
async function main() {
  const [email, reason] = [process.argv[2], process.argv[3]];
  if (!email || !reason) throw new Error('Informe o e-mail e, entre aspas, como a identidade foi confirmada');
  const [found] = await db.select({ id: user.id, enabled: user.twoFactorEnabled }).from(user).where(eq(user.email, email));
  if (!found) throw new Error(`Usuário não encontrado: ${email}`);
  if (!found.enabled) throw new Error(`${email} não usa login em duas etapas`);
  await db.transaction(async (tx) => {
    await tx.delete(twoFactor).where(eq(twoFactor.userId, found.id));
    await tx.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, found.id));
    await tx.delete(session).where(eq(session.userId, found.id));
    await recordAudit({
      action: 'auth.two_factor_reset', targetType: 'user', targetId: found.id,
      summary: `Pela linha de comando: ${reason}`.slice(0, 255), changes: [{ field: 'twoFactorEnabled', from: true, to: false }],
    }, tx);
  });
  await pool.end();
  console.log(`Login em duas etapas de ${email} desativado. Peça para a pessoa ativar de novo logo após entrar.`);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await pool.end();
  process.exit(1);
});
