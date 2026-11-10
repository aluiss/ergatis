'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { Empty, ErrorState, Loading, StatusBadge } from '@/components/app-ui';
import { FilterChips } from '@/components/list-ui';
import { Button } from '@/components/ui/button';
import { useListParams } from '@/hooks/use-list-params';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

interface Request { id: string; title: string; status: string; city: string; state: string; createdAt: string }

function Requests() {
  const { values, set } = useListParams(['status'] as const);
  const q = useQuery({ queryKey: ['requests'], queryFn: () => api<Request[]>('/requests/mine') });
  // A lista do cliente é curta: o filtro roda aqui, sem nova consulta.
  const items = q.data?.filter((r) => !values.status || r.status === values.status) ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Meus pedidos</h1>
        <Button asChild className="h-11 sm:h-9"><Link href="/pedidos/novo">Novo pedido</Link></Button>
      </div>
      <FilterChips label="Situação" value={values.status} onChange={(status) => set({ status })}
        options={[['', 'Todos'], ['open', 'Em análise'], ['hired', 'Contratados'], ['completed', 'Concluídos'], ['cancelled', 'Cancelados']] as const} />
      {q.isPending ? <Loading /> : q.error ? <ErrorState error={q.error} /> : items.length === 0 ? (
        <Empty>{values.status ? 'Nenhum pedido nessa situação.' : 'Você ainda não publicou pedidos.'}</Empty>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((r) => (
            <li key={r.id}>
              <Link href={`/pedidos/${r.id}`} className="hover:bg-muted flex min-h-16 items-center justify-between gap-3 p-3">
                <span className="min-w-0"><span className="block truncate font-medium">{r.title}</span><span className="text-muted-foreground block text-sm">{r.city} - {r.state} · {date(r.createdAt)}</span></span>
                <span className="flex shrink-0 items-center gap-2"><StatusBadge status={r.status} /><ChevronRight className="text-muted-foreground size-4" aria-hidden /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RequestsPage() { return <Suspense fallback={<Loading />}><Requests /></Suspense>; }
