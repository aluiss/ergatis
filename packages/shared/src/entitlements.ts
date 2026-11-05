/**
 * Benefícios que um plano ou uma cortesia podem conceder.
 * O código da aplicação consulta estes benefícios, nunca o nome do plano.
 */
export const PLAN_CODES = ['basic', 'pro', 'premium'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export interface Entitlements {
  /** Propostas por mês. `null` significa sem limite. */
  monthlyProposalLimit: number | null;
  /** Exibe no perfil público os serviços já realizados. */
  showCompletedServices: boolean;
  /** Destaque na ordenação das buscas. */
  searchHighlight: boolean;
  /** Selo no perfil e nos resultados de busca. */
  badge: boolean;
  /** Pode ver a nota do cliente antes de enviar proposta. */
  viewClientRating: boolean;
}

export type EntitlementKey = keyof Entitlements;

export const ENTITLEMENT_KEYS = [
  'monthlyProposalLimit',
  'showCompletedServices',
  'searchHighlight',
  'badge',
  'viewClientRating',
] as const satisfies readonly EntitlementKey[];

export const BASIC_ENTITLEMENTS: Entitlements = {
  monthlyProposalLimit: 5,
  showCompletedServices: false,
  searchHighlight: false,
  badge: false,
  viewClientRating: false,
};

/**
 * Combina benefícios escolhendo sempre o mais vantajoso para o usuário.
 * Assim, uma cortesia nunca reduz o que o plano pago já oferece.
 */
export function mergeEntitlements(
  base: Entitlements,
  ...grants: Partial<Entitlements>[]
): Entitlements {
  return grants.reduce<Entitlements>((acc, grant) => {
    const limit =
      grant.monthlyProposalLimit === undefined
        ? acc.monthlyProposalLimit
        : grant.monthlyProposalLimit === null || acc.monthlyProposalLimit === null
          ? null
          : Math.max(acc.monthlyProposalLimit, grant.monthlyProposalLimit);
    return {
      monthlyProposalLimit: limit,
      showCompletedServices: acc.showCompletedServices || !!grant.showCompletedServices,
      searchHighlight: acc.searchHighlight || !!grant.searchHighlight,
      badge: acc.badge || !!grant.badge,
      viewClientRating: acc.viewClientRating || !!grant.viewClientRating,
    };
  }, base);
}
