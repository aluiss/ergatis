'use client';

import { useQuery } from '@tanstack/react-query';
import { Empty, ErrorState, Loading } from '@/components/app-ui';
import { api } from '@/lib/api';

interface Item { id: string; action: string; targetType: string; targetId: string | null; createdAt: string }

export default function AdminAudit() {
  const q = useQuery({ queryKey: ['admin-audit'], queryFn: () => api<Item[]>('/admin/audit-logs') });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  if (q.data.length === 0) return <Empty>Nenhum registro.</Empty>;
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {q.data.map((l) => (
        <li key={l.id} className="flex justify-between gap-3 p-3">
          <span><b>{l.action}</b><span className="text-muted-foreground block">{l.targetType} {l.targetId}</span></span>
          <time className="text-muted-foreground shrink-0">{new Date(l.createdAt).toLocaleString('pt-BR')}</time>
        </li>
      ))}
    </ul>
  );
}
