import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { DASHBOARD_PERIODS, type Dashboard, type DashboardPeriod } from '@ergatis/shared';
import { InjectDb } from '../common/db.module';
import { UserId } from '../common/user-id.decorator';
import { ZodPipe } from '../common/zod.pipe';
import type { Db } from '../db/client';
import { EntitlementsService } from '../entitlements/entitlements.service';

const querySchema = z.object({ period: z.enum(Object.keys(DASHBOARD_PERIODS) as [DashboardPeriod, ...DashboardPeriod[]]).default('month') });

/** Início do período. "Este mês" segue o calendário de Brasília, não o UTC do servidor. */
const periodStart = (p: DashboardPeriod) => (p === 'month'
  ? sql`(date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')`
  : sql`now() - ${p === '90d' ? sql`interval '90 days'` : sql`interval '365 days'`}`);

const rate = (part: number, whole: number) => (whole > 0 ? part / whole : null);

@Injectable()
class DashboardService {
  constructor(@InjectDb() private readonly db: Db, private readonly entitlements: EntitlementsService) {}

  /** Tudo numa ida ao banco por papel: o painel é a primeira tela, tem de abrir rápido. */
  async get(userId: string, period: DashboardPeriod): Promise<Dashboard> {
    const from = periodStart(period);

    const { rows: [c] } = await this.db.execute<{
      from: Date; published: number; completed: number; in_analysis: number;
      active_client: number; active_pro: number; unread: number;
    }>(sql`
      select ${from} as from,
        (select count(*)::int from service_requests where client_id = ${userId} and created_at >= ${from}) as published,
        (select count(*)::int from service_requests where client_id = ${userId} and created_at >= ${from} and status = 'completed') as completed,
        (select count(*)::int from service_requests where client_id = ${userId} and status = 'open') as in_analysis,
        (select count(*)::int from engagements where client_id = ${userId} and status = 'active') as active_client,
        (select count(*)::int from engagements where professional_id = ${userId} and status = 'active') as active_pro,
        (select count(*)::int from messages m join conversations cv on cv.id = m.conversation_id
          where (cv.client_id = ${userId} or cv.professional_id = ${userId}) and m.sender_id <> ${userId} and m.read_at is null) as unread`);

    const { rows: [p] } = await this.db.execute<{
      is_pro: boolean; received: number; open_now: number; in_analysis: number; attended: number;
      earned: number; rating_avg: number | null; rating_total: number; used: number;
    }>(sql`
      with mine as (select category_id from professional_categories where professional_id = ${userId}),
      received as (
        select r.id from service_requests r
        where r.category_id in (select category_id from mine) and r.client_id <> ${userId} and r.created_at >= ${from}
      )
      select exists (select 1 from professionals where user_id = ${userId}) as is_pro,
        (select count(*)::int from received) as received,
        (select count(*)::int from service_requests r
          where r.status = 'open' and r.client_id <> ${userId} and r.category_id in (select category_id from mine)) as open_now,
        (select count(*)::int from proposals where professional_id = ${userId} and status = 'sent') as in_analysis,
        (select count(*)::int from engagements e
          where e.professional_id = ${userId} and e.status = 'completed' and e.request_id in (select id from received)) as attended,
        (select coalesce(sum(agreed_cents), 0)::int from engagements
          where professional_id = ${userId} and status = 'completed' and completed_at >= ${from}) as earned,
        (select avg(rating)::float from reviews where reviewee_id = ${userId}) as rating_avg,
        (select count(*)::int from reviews where reviewee_id = ${userId}) as rating_total,
        coalesce((select used from proposal_usage where professional_id = ${userId}
          and period = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')), 0) as used`);

    let professional: Dashboard['professional'] = null;
    if (p.is_pro) {
      const { entitlements } = await this.entitlements.forUser(userId);
      professional = {
        received: p.received, openNow: p.open_now, inAnalysis: p.in_analysis, attended: p.attended,
        attendanceRate: rate(p.attended, p.received), earnedCents: p.earned,
        rating: { average: p.rating_avg, total: p.rating_total },
        proposals: { used: p.used, limit: entitlements.monthlyProposalLimit },
      };
    }

    return {
      period: { key: period, from: new Date(c.from).toISOString() },
      client: { published: c.published, inAnalysis: c.in_analysis, completed: c.completed, completionRate: rate(c.completed, c.published) },
      professional,
      activeEngagements: { asClient: c.active_client, asProfessional: c.active_pro },
      unreadMessages: c.unread,
    };
  }
}

@Controller('dashboard')
class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  get(@UserId() userId: string, @Query(new ZodPipe(querySchema)) q: z.infer<typeof querySchema>) {
    return this.service.get(userId, q.period);
  }
}

@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
