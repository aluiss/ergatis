'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Empty, ErrorState, Loading, StatusBadge } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

interface Request { id: string; title: string; status: string; city: string; state: string; createdAt: string }

export default function Requests() {
  const q = useQuery({ queryKey: ['requests'], queryFn: () => api<Request[]>('/requests/mine') });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meus pedidos</h1>
        <Button asChild><Link href="/pedidos/novo">Novo pedido</Link></Button>
      </div>
      {q.isPending ? <Loading /> : q.error ? <ErrorState error={q.error} /> : q.data.length === 0 ? <Empty>Você ainda não publicou pedidos.</Empty> : (
        <ul className="divide-y rounded-lg border">
          {q.data.map((r) => (
            <li key={r.id}>
              <Link href={`/pedidos/${r.id}`} className="hover:bg-muted flex items-center justify-between gap-3 p-3">
                <span><span className="font-medium">{r.title}</span><span className="text-muted-foreground block text-sm">{r.city} - {r.state} · {date(r.createdAt)}</span></span>
                <StatusBadge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
