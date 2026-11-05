import { Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  BASIC_ENTITLEMENTS, mergeEntitlements, type Entitlements, type EntitlementKey, type PlanCode,
} from '@ergatis/shared';
import { InjectDb } from '../common/db.module';
import type { Db, DbOrTx } from '../db/client';
import { entitlementGrants, plans, subscriptions } from '../db/schema';

export interface EffectiveAccess {
  plan: PlanCode;
  entitlements: Entitlements;
}

const RANK: Record<PlanCode, number> = { basic: 0, pro: 1, premium: 2 };

/**
 * Expressão SQL equivalente a `forUser` para um benefício booleano.
 * Usada na busca, onde calcular usuário a usuário seria inviável.
 */
export function entitlementFlagSql(userId: AnyPgColumn, key: Exclude<EntitlementKey, 'monthlyProposalLimit'>): SQL<boolean> {
  return sql<boolean>`(
    exists (
      select 1 from subscriptions s join plans p on p.code = s.plan_code
      where s.user_id = ${userId}
        and s.status in ('active', 'past_due')
        and coalesce(s.current_period_end, 'infinity') > now()
        and coalesce((p.entitlements->>${key})::boolean, false)
    ) or exists (
      select 1 from entitlement_grants g left join plans p on p.code = g.plan_code
      where g.user_id = ${userId}
        and g.revoked_at is null
        and g.starts_at <= now()
        and (g.ends_at is null or g.ends_at > now())
        and (coalesce((g.entitlements->>${key})::boolean, false)
          or coalesce((p.entitlements->>${key})::boolean, false))
    )
  )`;
}

@Injectable()
export class EntitlementsService {
  constructor(@InjectDb() private readonly db: Db) {}

  async forUser(userId: string, tx: DbOrTx = this.db): Promise<EffectiveAccess> {
    const now = new Date();
    // Sequencial de propósito: dentro de uma transação só existe uma conexão.
    const allPlans = await tx.select().from(plans);
    const subs = await tx.select().from(subscriptions).where(and(
      eq(subscriptions.userId, userId),
      inArray(subscriptions.status, ['active', 'past_due']),
      or(isNull(subscriptions.currentPeriodEnd), gt(subscriptions.currentPeriodEnd, now)),
    ));
    const grants = await tx.select().from(entitlementGrants).where(and(
      eq(entitlementGrants.userId, userId),
      isNull(entitlementGrants.revokedAt),
      lte(entitlementGrants.startsAt, now),
      or(isNull(entitlementGrants.endsAt), gt(entitlementGrants.endsAt, now)),
    ));

    const byCode = new Map(allPlans.map((p) => [p.code, p.entitlements]));
    const base = byCode.get('basic') ?? BASIC_ENTITLEMENTS;
    const codes = [
      ...subs.map((s) => s.planCode),
      ...grants.flatMap((g) => (g.planCode ? [g.planCode] : [])),
    ];
    const layers = [
      ...codes.flatMap((c) => { const e = byCode.get(c); return e ? [e] : []; }),
      ...grants.flatMap((g) => (g.entitlements ? [g.entitlements] : [])),
    ];

    return {
      plan: codes.reduce<PlanCode>((best, c) => (RANK[c] > RANK[best] ? c : best), 'basic'),
      entitlements: mergeEntitlements(base, ...layers),
    };
  }
}
