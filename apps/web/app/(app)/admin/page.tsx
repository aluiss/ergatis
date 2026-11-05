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
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-lg border p-4"><dt className="text-muted-foreground text-sm">{label}</dt><dd className="mt-1 text-2xl font-bold">{value}</dd></div>
      ))}
    </dl>
  );
}
