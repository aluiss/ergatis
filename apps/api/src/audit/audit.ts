import { Logger } from '@nestjs/common';
import { db, type DbOrTx } from '../db/client';
import { auditLogs } from '../db/schema';

const logger = new Logger('Audit');

export interface AuditEntry {
  /** Quem fez. Nulo para o sistema, webhooks ou tentativas sem login. */
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  /** Nunca inclua senhas, tokens, links de e-mail ou conteúdo de mensagens. */
  metadata?: Record<string, unknown>;
}

/**
 * Grava um registro de auditoria. Uma falha aqui não derruba a ação do usuário:
 * fica no log de erro. Dentro de uma transação, passe `tx` para gravar junto.
 */
export async function recordAudit(entry: AuditEntry, executor: DbOrTx = db) {
  try {
    await executor.insert(auditLogs).values({
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata && Object.keys(entry.metadata).length > 0 ? entry.metadata : null,
    });
  } catch (error) {
    if (executor !== db) throw error; // Em transação, quem chamou decide.
    logger.error(`Falha ao registrar ${entry.action}`, error instanceof Error ? error.stack : String(error));
  }
}

/** "fulano@gmail.com" -> "fu***@gmail.com": identifica sem expor o endereço inteiro. */
export function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}
