import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { InjectDb } from '../common/db.module';
import { env } from '../config/env';
import type { Db } from '../db/client';

const DAY_MS = 86_400_000;
/** Apagar em lotes: um DELETE de milhões de linhas segura lock e incha o WAL. */
const BATCH_SIZE = 5_000;
/** Chave do advisory lock: com várias instâncias da API, só uma expurga por vez. */
const LOCK_KEY = 74_201;

/**
 * Remove registros mais antigos que AUDIT_RETENTION_MONTHS. Roda uma vez por dia
 * (e alguns minutos depois de subir), sempre fora da auditoria: o expurgo não vira linha.
 */
@Injectable()
export class AuditRetentionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AuditRetentionService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(@InjectDb() private readonly db: Db) {}

  onApplicationBootstrap() {
    if (env.NODE_ENV === 'test') return;
    this.timers.push(setTimeout(() => { void this.purgeExpired(); }, 5 * 60_000));
    this.timers.push(setInterval(() => { void this.purgeExpired(); }, DAY_MS));
  }

  onApplicationShutdown() { this.timers.forEach(clearTimeout); }

  /** Devolve quantos registros saíram. Nunca lança: uma falha fica no log e tenta no dia seguinte. */
  async purgeExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - env.AUDIT_RETENTION_MONTHS);
    try {
      let removed = 0;
      for (;;) {
        // Lock de transação, um por lote: com pool, um lock de sessão poderia ser
        // liberado em outra conexão e ficar preso para sempre.
        const deleted = await this.db.transaction(async (tx) => {
          const { rows: [lock] } = await tx.execute<{ ok: boolean }>(sql`select pg_try_advisory_xact_lock(${LOCK_KEY}) as ok`);
          if (!lock?.ok) return null;
          const result = await tx.execute(sql`
            delete from audit_logs where id in (
              select id from audit_logs where created_at < ${cutoff} limit ${BATCH_SIZE}
            )`);
          return result.rowCount ?? 0;
        });
        if (deleted === null) break; // outra instância está expurgando
        removed += deleted;
        if (deleted < BATCH_SIZE) break;
      }
      if (removed > 0) this.logger.log(`Auditoria: ${removed} registros anteriores a ${cutoff.toISOString().slice(0, 10)} removidos.`);
      return removed;
    } catch (error) {
      this.logger.error('Falha no expurgo da auditoria', error instanceof Error ? error.stack : String(error));
      return 0;
    }
  }
}
