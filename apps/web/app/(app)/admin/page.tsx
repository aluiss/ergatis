'use client';

import { useQuery } from '@tanstack/react-query';
import { ErrorState, Loading } from '@/components/app-ui';
import { api } from '@/lib/api';
import { money } from '@/lib/format';

interface Metrics {
  users: number; pros: number; open: number; completed: number; paying: number;
  mrrCents: number; openReports: number; pendingVerifications: number;
}

export default function AdminHome() {
  const q = useQuery({ queryKey: ['admin-metrics'], queryFn: () => api<Metrics>('/admin/metrics') });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const m = q.data;
  const cards: [string, string | number][] = [
    ['Usuários', m.users], ['Profissionais', m.pros], ['Pedidos abertos', m.open], ['Serviços concluídos', m.completed],
    ['Assinantes', m.paying], ['Receita mensal recorrente', money(m.mrrCents)], ['Denúncias abertas', m.openReports], ['Verificações pendentes', m.pendingVerifications],
  ];
  return (
    <div className="space-y-4">
    <h1 className="text-2xl font-bold">Visão geral</h1>
    <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-lg border p-3 sm:p-4"><dt className="text-muted-foreground text-xs sm:text-sm">{label}</dt><dd className="mt-1 text-xl font-bold sm:text-2xl">{value}</dd></div>
      ))}
    </dl>
    </div>
  );
}
