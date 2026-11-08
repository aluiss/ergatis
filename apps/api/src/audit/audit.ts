import { Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { AuditActionKey, AuditChange } from '@ergatis/shared';
import { db, type DbOrTx } from '../db/client';
import { auditLogs, user } from '../db/schema';
import { getAuditContext } from './audit-context';
import { redact } from './audit-policy';

const logger = new Logger('Audit');

export interface AuditEntry {
  /** Quem fez. Nulo para o sistema, webhooks ou tentativas sem login. */
  actorId?: string | null;
  action: AuditActionKey;
  targetType: string;
  targetId?: string | null;
  /** Frase legível, quando o rótulo da ação não basta. */
  summary?: string | null;
  /** Campos alterados; use `diff()` da política, que já trata dados sensíveis. */
  changes?: AuditChange[] | null;
  /** Detalhes. Passam pela política de dados sensíveis antes de gravar. */
  metadata?: Record<string, unknown>;
}

/** Papel do autor no momento da ação. Do contexto quando é quem está logado; senão, do banco. */
async function roleOf(actorId: string, executor: DbOrTx) {
  const context = getAuditContext();
  if (context?.actorId === actorId && context.actorRole) return context.actorRole;
  const [row] = await executor.select({ role: user.role }).from(user).where(eq(user.id, actorId));
  return row?.role ?? null;
}

/**
 * Grava um registro de auditoria, completando com o contexto da requisição
 * (requestId, IP, navegador, rota). Fora de transação, uma falha não derruba a
 * ação do usuário: vai para o log de erro. Dentro de uma, passe `tx` para gravar
 * junto, e quem chamou decide.
 */
export async function recordAudit(entry: AuditEntry, executor: DbOrTx = db) {
  const context = getAuditContext();
  if (context?.suppressed) return;
  try {
    const actorId = entry.actorId ?? null;
    const origin = context
      ? { ip: context.ip, userAgent: context.userAgent, method: context.method, route: context.route }
      : { origin: 'sistema' };
    const metadata = redact({ ...origin, ...entry.metadata }) as Record<string, unknown>;
    const clean = Object.fromEntries(Object.entries(metadata).filter(([, v]) => v !== null && v !== undefined && v !== ''));

    await executor.insert(auditLogs).values({
      requestId: context?.requestId ?? null,
      actorId,
      actorRole: actorId ? await roleOf(actorId, executor) : null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      summary: entry.summary?.slice(0, 255) ?? null,
      changes: entry.changes?.length ? entry.changes : null,
      metadata: Object.keys(clean).length > 0 ? clean : null,
    });
  } catch (error) {
    if (executor !== db) throw error;
    logger.error(`Falha ao registrar ${entry.action}`, error instanceof Error ? error.stack : String(error));
  }
}

/** "fulano@gmail.com" -> "fu***@gmail.com": identifica sem expor o endereço inteiro. */
export function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}
