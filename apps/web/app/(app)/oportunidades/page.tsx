'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Empty, ErrorState, Loading } from '@/components/app-ui';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { money } from '@/lib/format';

interface Item {
  id: string; title: string; description: string; city: string; state: string;
  budgetCents: number | null; urgent: boolean; alreadyProposed: boolean;
}

export default function Opportunities() {
  const q = useQuery({ queryKey: ['feed'], queryFn: () => api<Item[]>('/requests/feed') });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Oportunidades</h1>
      {q.isPending ? <Loading /> : q.error ? (
        <Empty>{q.error.message}. <Link className="text-primary" href="/perfil">Ir para o perfil</Link></Empty>
      ) : q.data.length === 0 ? <Empty>Nenhum pedido aberto nas suas categorias agora.</Empty> : (
        <ul className="divide-y rounded-lg border">
          {q.data.map((r) => (
            <li key={r.id}>
              <Link href={`/pedidos/${r.id}`} className="hover:bg-muted block p-3">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {r.title}
                  {r.urgent && <Badge variant="destructive">Urgente</Badge>}
                  {r.alreadyProposed && <Badge variant="secondary">Proposta enviada</Badge>}
                </span>
                <span className="text-muted-foreground block text-sm">{r.city} - {r.state}{r.budgetCents ? ` · ${money(r.budgetCents)}` : ''}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
