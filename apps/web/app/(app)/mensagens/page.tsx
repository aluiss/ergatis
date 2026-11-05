'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Empty, ErrorState, Loading } from '@/components/app-ui';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

interface Item { id: string; requestTitle: string; otherName: string; unread: number }

export default function Conversations() {
  const q = useQuery({ queryKey: ['conversations'], queryFn: () => api<Item[]>('/conversations'), refetchInterval: 15_000 });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mensagens</h1>
      {q.isPending ? <Loading /> : q.error ? <ErrorState error={q.error} /> : q.data.length === 0 ? <Empty>As conversas começam quando uma proposta é enviada.</Empty> : (
        <ul className="divide-y rounded-lg border">
          {q.data.map((c) => (
            <li key={c.id}>
              <Link href={`/mensagens/${c.id}`} className="hover:bg-muted flex items-center justify-between gap-3 p-3">
                <span><span className="font-medium">{c.otherName}</span><span className="text-muted-foreground block text-sm">{c.requestTitle}</span></span>
                {c.unread > 0 && <Badge>{c.unread}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
