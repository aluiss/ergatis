/** Períodos do painel inicial. Os números de "agora" (em análise, não lidas) não dependem dele. */
export const DASHBOARD_PERIODS = { month: 'Este mês', '90d': '3 meses', '365d': '12 meses' } as const;
export type DashboardPeriod = keyof typeof DASHBOARD_PERIODS;

export interface ClientDashboard {
  /** Pedidos publicados no período. */
  published: number;
  /** Abertos agora, recebendo e analisando propostas. */
  inAnalysis: number;
  /** Dos publicados no período, quantos foram concluídos. */
  completed: number;
  /** completed / published; nulo sem pedidos no período. */
  completionRate: number | null;
}

export interface ProfessionalDashboard {
  /** Pedidos publicados no período nas categorias do profissional. */
  received: number;
  /** Abertos agora nas categorias dele (a lista de Oportunidades). */
  openNow: number;
  /** Propostas dele aguardando a decisão do cliente. */
  inAnalysis: number;
  /** Dos pedidos recebidos no período, quantos ele atendeu até a conclusão. */
  attended: number;
  /** attended / received; nulo sem pedidos no período. */
  attendanceRate: number | null;
  /** Soma dos serviços concluídos no período, em centavos. */
  earnedCents: number;
  /** Nota média recebida (todas as avaliações) e quantas. */
  rating: { average: number | null; total: number };
  /** Uso do limite de propostas do mês; `limit` nulo = sem limite. */
  proposals: { used: number; limit: number | null };
}

export interface Dashboard {
  period: { key: DashboardPeriod; from: string };
  client: ClientDashboard;
  professional: ProfessionalDashboard | null;
  /** Contratações em andamento, como cliente ou profissional. */
  activeEngagements: { asClient: number; asProfessional: number };
  unreadMessages: number;
}
