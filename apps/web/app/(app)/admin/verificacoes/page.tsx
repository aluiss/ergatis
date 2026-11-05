'use client';

import { useQuery } from '@tanstack/react-query';
import { Empty, ErrorState, Loading, post, useAction } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface Item { userId: string; name: string; email: string; headline: string }

export default function AdminVerifications() {
  const q = useQuery({ queryKey: ['admin-verifications'], queryFn: () => api<Item[]>('/admin/verifications') });
  const decide = useAction(({ id, approved }: { id: string; approved: boolean }) =>
    post(`/admin/verifications/${id}`, { approved }), { invalidate: ['admin-verifications'], success: 'Decisão registrada.' });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  if (q.data.length === 0) return <Empty>Nenhuma verificação pendente.</Empty>;
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {q.data.map((v) => (
        <li key={v.userId} className="flex items-center justify-between gap-3 p-3">
          <span><b>{v.name}</b><span className="text-muted-foreground block">{v.email} · {v.headline}</span></span>
          <span className="flex gap-2">
            <Button size="sm" onClick={() => decide.mutate({ id: v.userId, approved: true })}>Aprovar</Button>
            <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: v.userId, approved: false })}>Recusar</Button>
          </span>
        </li>
      ))}
    </ul>
  );
}
