'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { isStaffRole, ROLE_LABELS, type UserRole } from '@ergatis/shared';
import { Empty, ErrorState, Loading } from '@/components/app-ui';
import { FilterChips, Pager, SearchBar } from '@/components/list-ui';
import { Badge } from '@/components/ui/badge';
import { useListParams } from '@/hooks/use-list-params';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

interface User { id: string; name: string; email: string; role: UserRole | null; banned: boolean | null; createdAt: string }
interface Result { items: User[]; total: number; pageSize: number }

function Users() {
  const { values, page, set, query } = useListParams(['q', 'role', 'status'] as const);
  const list = useQuery({
    queryKey: ['admin-users', query()],
    queryFn: () => api<Result>(`/admin/users?${query()}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Usuários</h1>
      <SearchBar value={values.q} onSearch={(q) => set({ q })} placeholder="Nome ou e-mail" />
      <FilterChips label="Papel" value={values.role} onChange={(role) => set({ role })}
        options={[['', 'Todos'], ['staff', 'Equipe'], ['user', 'Usuários comuns']] as const} />
      <FilterChips label="Situação" value={values.status} onChange={(status) => set({ status })}
        options={[['', 'Qualquer situação'], ['active', 'Ativos'], ['banned', 'Banidos']] as const} />

      {list.isPending ? <Loading /> : list.error ? <ErrorState error={list.error} /> : list.data.items.length === 0 ? (
        <Empty>Nenhum usuário com esses filtros.</Empty>
      ) : (
        <>
          <ul className={`divide-y rounded-lg border ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
            {list.data.items.map((u) => (
              <li key={u.id}>
                <Link href={`/admin/usuarios/${u.id}`} className="hover:bg-muted flex min-h-16 items-center gap-3 p-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="text-muted-foreground block truncate">{u.email}</span>
                    <span className="text-muted-foreground block text-xs">Desde {date(u.createdAt)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {isStaffRole(u.role) && <Badge>{ROLE_LABELS[u.role]}</Badge>}
                    {u.banned && <Badge variant="destructive">Banido</Badge>}
                  </span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <Pager page={page} total={list.data.total} pageSize={list.data.pageSize} onPage={(p) => set({ page: String(p) })} noun={['usuário', 'usuários']} />
        </>
      )}
    </div>
  );
}

export default function UsersPage() { return <Suspense fallback={<Loading />}><Users /></Suspense>; }
