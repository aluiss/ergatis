'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Empty, ErrorState, Loading, StatusBadge, useAction } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

interface Item { id: string; targetUserId: string; reason: string; status: string; createdAt: string }

export default function AdminReports() {
  const q = useQuery({ queryKey: ['admin-reports'], queryFn: () => api<Item[]>('/admin/reports') });
  const update = useAction(({ id, status }: { id: string; status: string }) =>
    api(`/admin/reports/${id}`, { method: 'PATCH', body: { status } }), { invalidate: ['admin-reports'], success: 'Denúncia atualizada.' });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  if (q.data.length === 0) return <Empty>Nenhuma denúncia.</Empty>;
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {q.data.map((r) => (
        <li key={r.id} className="space-y-2 p-3">
          <div className="flex items-center justify-between gap-3"><Link className="text-primary" href={`/admin/usuarios/${r.targetUserId}`}>Ver usuário denunciado</Link><StatusBadge status={r.status} /></div>
          <p>{r.reason}</p>
          <p className="text-muted-foreground text-xs">{date(r.createdAt)}</p>
          {['open', 'reviewing'].includes(r.status) && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => update.mutate({ id: r.id, status: 'resolved' })}>Resolver</Button>
              <Button size="sm" variant="outline" onClick={() => update.mutate({ id: r.id, status: 'dismissed' })}>Arquivar</Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
