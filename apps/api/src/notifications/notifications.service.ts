import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { InjectDb } from '../common/db.module';
import type { Db, DbOrTx } from '../db/client';
import { notifications } from '../db/schema';

@Injectable()
export class NotificationsService {
  constructor(@InjectDb() private readonly db: Db) {}

  async notify(tx: DbOrTx, userId: string, type: string, title: string, link?: string) {
    await tx.insert(notifications).values({ userId, type, title, link });
  }

  list(userId: string) {
    return this.db.select().from(notifications).where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt)).limit(50);
  }

  /** Contadores do menu: leve o bastante para consultar a cada poucos segundos. */
  async unreadCounts(userId: string) {
    const [n] = await this.db.select({ value: count() }).from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    const { rows: [m] } = await this.db.execute<{ value: number }>(sql`
      select count(*)::int as value from messages m
      join conversations c on c.id = m.conversation_id
      where (c.client_id = ${userId} or c.professional_id = ${userId})
        and m.sender_id <> ${userId} and m.read_at is null`);
    return { notifications: n.value, messages: m?.value ?? 0 };
  }

  async markAllRead(userId: string) {
    await this.db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return { ok: true };
  }

  async markRead(userId: string, id: string) {
    await this.db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt)));
    return { ok: true };
  }
}
