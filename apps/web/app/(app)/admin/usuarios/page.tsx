'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorState, Loading } from '@/components/app-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isStaffRole, ROLE_LABELS } from '@ergatis/shared';
import { api } from '@/lib/api';

interface Result { items: { id: string; name: string; email: string; role: string; banned: boolean }[]; total: number; pageSize: number }

export default function Users() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['admin-users', q, page],
    queryFn: () => api<Result>(`/admin/users?${new URLSearchParams({ q, page: String(page) })}`),
  });
  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(String(new FormData(e.currentTarget).get('q'))); }} className="flex max-w-md gap-2">
        <Input name="q" placeholder="Nome ou e-mail" aria-label="Buscar usuários" /><Button>Buscar</Button>
      </form>
      {list.isPending ? <Loading /> : list.error ? <ErrorState error={list.error} /> : (
        <>
          <ul className="divide-y rounded-lg border">
            {list.data.items.map((u) => (
              <li key={u.id}>
                <Link href={`/admin/usuarios/${u.id}`} className="hover:bg-muted flex items-center justify-between gap-3 p-3 text-sm">
                  <span><b>{u.name}</b><span className="text-muted-foreground block">{u.email}</span></span>
                  <span className="flex gap-1">{isStaffRole(u.role) && <Badge>{ROLE_LABELS[u.role]}</Badge>}{u.banned && <Badge variant="destructive">Banido</Badge>}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3 text-sm">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button>
            <span>Página {page} de {Math.max(1, Math.ceil(list.data.total / list.data.pageSize))}</span>
            <Button size="sm" variant="outline" disabled={page * list.data.pageSize >= list.data.total} onClick={() => setPage(page + 1)}>Próxima</Button>
          </div>
        </>
      )}
    </div>
  );
}
