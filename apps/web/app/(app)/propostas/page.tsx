'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Empty, ErrorState, Loading, pendingFor, post, StatusBadge, useAction } from '@/components/app-ui';
import { ConfirmAction } from '@/components/confirm-action';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { money } from '@/lib/format';

interface Item { id: string; requestId: string; requestTitle: string; amountCents: number; status: string }

export default function Proposals() {
  const q = useQuery({ queryKey: ['proposals'], queryFn: () => api<Item[]>('/proposals/mine') });
  const withdraw = useAction((id: string) => post(`/proposals/${id}/withdraw`), { invalidate: ['proposals'], success: 'Proposta retirada.' });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Minhas propostas</h1>
      {q.isPending ? <Loading /> : q.error ? <ErrorState error={q.error} /> : q.data.length === 0 ? <Empty>Você ainda não enviou propostas.</Empty> : (
        <ul className="divide-y rounded-lg border">
          {q.data.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-3">
              <span><Link className="font-medium" href={`/pedidos/${p.requestId}`}>{p.requestTitle}</Link><span className="text-muted-foreground block text-sm">{money(p.amountCents)}</span></span>
              <span className="flex items-center gap-2">
                <StatusBadge status={p.status} />
                {p.status === 'sent' && (
                  <ConfirmAction
                    title="Retirar esta proposta?"
                    description={`O cliente deixa de vê-la em "${p.requestTitle}". Não dá para reenviar para o mesmo pedido.`}
                    confirmLabel="Retirar proposta" destructive
                    onConfirm={() => withdraw.mutateAsync(p.id)}
                  >
                    <Button size="sm" variant="outline" loading={pendingFor(withdraw, (v) => v === p.id)}>Retirar</Button>
                  </ConfirmAction>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
