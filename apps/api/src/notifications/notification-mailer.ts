import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { and, eq, gt, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { InjectDb } from '../common/db.module';
import { env } from '../config/env';
import type { Db } from '../db/client';
import { notifications, user } from '../db/schema';
import { sendMail } from '../mail/mail';

/** Tipos que viram e-mail. Os demais ficam apenas dentro do site. */
export const EMAIL_TYPES = [
  'proposal_received', 'proposal_accepted', 'message_received', 'engagement_completed',
  'engagement_cancelled', 'review_received', 'subscription_active', 'subscription_past_due',
  'verification_decided', 'grant_received',
];
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;
const INTERVAL_MS = 30_000;
const MESSAGE_WINDOW_MS = 15 * 60_000;

type Claimed = { id: string; user_id: string; type: string; title: string; link: string | null };

/** Envia a fila de notificações fora da transação que as criou. */
@Injectable()
export class NotificationMailer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationMailer.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(@InjectDb() private readonly db: Db) {}

  onApplicationBootstrap() {
    if (env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => { void this.tick(); }, INTERVAL_MS);
  }

  onApplicationShutdown() { clearInterval(this.timer); }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(`Falha na fila de e-mails: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  /** SKIP LOCKED permite mais de uma instância da API sem envio duplicado. */
  private async claim(): Promise<Claimed[]> {
    const types = sql.join(EMAIL_TYPES.map((t) => sql`${t}`), sql`, `);
    const result = await this.db.execute<Claimed>(sql`
      update notifications set email_claimed_at = now()
      where id in (
        select n.id from notifications n
        join "user" u on u.id = n.user_id
        join profiles p on p.user_id = n.user_id
        where n.email_claimed_at is null
          and n.email_attempts < ${MAX_ATTEMPTS}
          and n.type in (${types})
          and n.created_at > now() - interval '1 day'
          and p.email_notifications
          and not coalesce(u.banned, false)
        order by n.created_at
        limit ${BATCH_SIZE}
        for update of n skip locked
      )
      returning id, user_id, type, title, link`);
    return result.rows;
  }

  private async recentlySent(item: Claimed) {
    if (item.type !== 'message_received' || !item.link) return false;
    const [recent] = await this.db.select({ id: notifications.id }).from(notifications).where(and(
      eq(notifications.userId, item.user_id),
      eq(notifications.link, item.link),
      ne(notifications.id, item.id),
      isNotNull(notifications.emailSentAt),
      gt(notifications.emailSentAt, new Date(Date.now() - MESSAGE_WINDOW_MS)),
    ));
    return !!recent;
  }

  async runOnce() {
    const claimed = await this.claim();
    if (claimed.length === 0) return 0;
    const owners = await this.db.select({ id: user.id, email: user.email }).from(user)
      .where(inArray(user.id, claimed.map((c) => c.user_id)));
    const emailOf = new Map(owners.map((o) => [o.id, o.email]));

    let sent = 0;
    for (const item of claimed) {
      if (await this.recentlySent(item)) continue;
      const link = item.link ? `\n\nAcesse: ${env.WEB_URL}${item.link}` : '';
      const footer = `\n\n--\nVocê pode desligar estes avisos na página de perfil: ${env.WEB_URL}/perfil`;
      try {
        await sendMail(emailOf.get(item.user_id)!, item.title, `${item.title}${link}${footer}`, { userId: item.user_id });
        await this.db.update(notifications).set({ emailSentAt: new Date() }).where(eq(notifications.id, item.id));
        sent += 1;
      } catch (error) {
        this.logger.warn(`Reenvio pendente da notificação ${item.id}: ${String(error)}`);
        await this.db.update(notifications)
          .set({ emailClaimedAt: null, emailAttempts: sql`${notifications.emailAttempts} + 1` })
          .where(eq(notifications.id, item.id));
      }
    }
    return sent;
  }
}
