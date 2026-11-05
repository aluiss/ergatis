import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
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

  async markRead(userId: string, id: string) {
    await this.db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt)));
    return { ok: true };
  }
}
