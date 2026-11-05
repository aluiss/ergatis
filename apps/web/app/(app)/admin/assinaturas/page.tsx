'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Empty, ErrorState, Loading, StatusBadge } from '@/components/app-ui';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

interface Item { id: string; userId: string; userName: string; userEmail: string; planCode: string; status: string; currentPeriodEnd: string | null; cancelledAt: string | null }

export default function AdminSubscriptions() {
  const q = useQuery({ queryKey: ['admin-subscriptions'], queryFn: () => api<Item[]>('/admin/subscriptions') });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  if (q.data.length === 0) return <Empty>Nenhuma assinatura.</Empty>;
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {q.data.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-3 p-3">
          <span><Link className="font-medium" href={`/admin/usuarios/${s.userId}`}>{s.userName}</Link><span className="text-muted-foreground block">{s.userEmail} · <span className="capitalize">{s.planCode}</span>{s.currentPeriodEnd ? ` · até ${date(s.currentPeriodEnd)}` : ''}{s.cancelledAt ? ' · cancelamento solicitado' : ''}</span></span>
          <StatusBadge status={s.status} />
        </li>
      ))}
    </ul>
  );
}
