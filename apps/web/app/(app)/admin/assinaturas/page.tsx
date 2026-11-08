'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Suspense } from 'react';
import { Empty, ErrorState, Loading, StatusBadge } from '@/components/app-ui';
import { HistoryButton } from '@/components/audit';
import { FilterChips, Pager, SearchBar } from '@/components/list-ui';
import { useListParams } from '@/hooks/use-list-params';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

interface Item {
  id: string; userId: string; userName: string; userEmail: string; planCode: string; status: string; provider: string;
  currentPeriodEnd: string | null; cancelledAt: string | null; createdAt: string;
}
interface Result { items: Item[]; total: number; pageSize: number }

function Subscriptions() {
  const { values, page, set, query } = useListParams(['q', 'status'] as const);
  const list = useQuery({
    queryKey: ['admin-subscriptions', query()],
    queryFn: () => api<Result>(`/admin/subscriptions?${query()}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Assinaturas</h1>
      <SearchBar value={values.q} onSearch={(q) => set({ q })} placeholder="Nome ou e-mail do assinante" />
      <FilterChips label="Situação" value={values.status} onChange={(status) => set({ status })}
        options={[['', 'Todas'], ['active', 'Ativas'], ['past_due', 'Em atraso'], ['pending', 'Pendentes'], ['cancelled', 'Canceladas']] as const} />

      {list.isPending ? <Loading /> : list.error ? <ErrorState error={list.error} /> : list.data.items.length === 0 ? (
        <Empty>Nenhuma assinatura com esses filtros.</Empty>
      ) : (
        <>
          <ul className={`divide-y rounded-lg border text-sm ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
            {list.data.items.map((s) => (
              <li key={s.id} className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <Link className="block truncate font-medium hover:underline" href={`/admin/usuarios/${s.userId}`}>{s.userName}</Link>
                    <span className="text-muted-foreground block truncate">{s.userEmail}</span>
                  </span>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-muted-foreground text-xs">
                  Plano <span className="capitalize">{s.planCode}</span> · desde {date(s.createdAt)}
                  {s.currentPeriodEnd ? ` · pago até ${date(s.currentPeriodEnd)}` : ''}
                  {s.cancelledAt ? ' · cancelamento solicitado' : ''} · {s.provider}
                </p>
                <HistoryButton type="subscription" id={s.id} title={`Assinatura de ${s.userName}`} />
              </li>
            ))}
          </ul>
          <Pager page={page} total={list.data.total} pageSize={list.data.pageSize} onPage={(p) => set({ page: String(p) })} noun={['assinatura', 'assinaturas']} />
        </>
      )}
    </div>
  );
}

export default function SubscriptionsPage() { return <Suspense fallback={<Loading />}><Subscriptions /></Suspense>; }
