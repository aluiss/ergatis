'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { useAccess } from '@/components/access-provider';
import { Empty, ErrorState, Loading, pendingFor, StatusBadge, useAction } from '@/components/app-ui';
import { HistoryButton } from '@/components/audit';
import { ConfirmAction } from '@/components/confirm-action';
import { FilterChips, Pager, SearchBar } from '@/components/list-ui';
import { Button } from '@/components/ui/button';
import { useListParams } from '@/hooks/use-list-params';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

interface Item {
  id: string; reason: string; status: string; resolution: string | null; createdAt: string;
  targetUserId: string; targetName: string; targetEmail: string; reporterId: string; reporterName: string; targetReports: number;
}
interface Result { items: Item[]; total: number; pageSize: number }

function Reports() {
  const { can } = useAccess();
  // Abre na fila de trabalho: o que ainda precisa de alguém.
  const { values, page, set, query } = useListParams(['q', 'status'] as const, { status: 'pending' });
  const list = useQuery({
    queryKey: ['admin-reports', query()],
    queryFn: () => api<Result>(`/admin/reports?${query()}`),
    placeholderData: keepPreviousData,
  });
  const update = useAction(({ id, status, resolution }: { id: string; status: string; resolution?: string }) =>
    api(`/admin/reports/${id}`, { method: 'PATCH', body: { status, resolution } }), { invalidate: ['admin-reports'], success: 'Denúncia atualizada.' });
  const editable = can('admin.reports', 'edit');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Denúncias</h1>
      <SearchBar value={values.q} onSearch={(q) => set({ q })} placeholder="Motivo ou nome" />
      <FilterChips label="Situação" value={values.status} onChange={(status) => set({ status })}
        options={[['pending', 'Pendentes'], ['open', 'Abertas'], ['reviewing', 'Em análise'], ['resolved', 'Resolvidas'], ['dismissed', 'Arquivadas'], ['', 'Todas']] as const} />

      {list.isPending ? <Loading /> : list.error ? <ErrorState error={list.error} /> : list.data.items.length === 0 ? (
        <Empty>{values.status === 'pending' ? 'Nenhuma denúncia esperando análise.' : 'Nenhuma denúncia com esses filtros.'}</Empty>
      ) : (
        <>
          <ul className={`space-y-3 ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
            {list.data.items.map((r) => (
              <li key={r.id} className="space-y-3 rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="text-muted-foreground block text-xs">Denunciado</span>
                    <Link className="block truncate font-medium hover:underline" href={`/admin/usuarios/${r.targetUserId}`}>{r.targetName}</Link>
                    <span className="text-muted-foreground block truncate text-xs">{r.targetEmail}</span>
                  </span>
                  <StatusBadge status={r.status} />
                </div>
                {r.targetReports > 1 && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-4" aria-hidden /> {r.targetReports} denúncias contra esta pessoa
                  </p>
                )}
                <p className="whitespace-pre-wrap">{r.reason}</p>
                <p className="text-muted-foreground text-xs">Por {r.reporterName} · {date(r.createdAt)}</p>
                {r.resolution && <p className="bg-muted rounded-md p-2 text-xs"><b>Resolução:</b> {r.resolution}</p>}

                <div className="flex flex-wrap items-center gap-2">
                  {editable && r.status === 'open' && (
                    <Button size="sm" variant="outline" loading={pendingFor(update, (v) => v.id === r.id && v.status === 'reviewing')}
                      onClick={() => update.mutate({ id: r.id, status: 'reviewing' })}>Assumir análise</Button>
                  )}
                  {editable && ['open', 'reviewing'].includes(r.status) && (
                    <>
                      <ConfirmAction
                        title="Marcar a denúncia como resolvida?"
                        description="Registre o que foi feito. A anotação fica na auditoria e ajuda em casos futuros com a mesma pessoa."
                        confirmLabel="Resolver"
                        reason={{ label: 'O que foi feito', required: true, minLength: 3, placeholder: 'Ex.: usuário advertido; conta banida' }}
                        onConfirm={(resolution) => update.mutateAsync({ id: r.id, status: 'resolved', resolution })}
                      >
                        <Button size="sm" loading={pendingFor(update, (v) => v.id === r.id && v.status === 'resolved')} disabled={pendingFor(update, (v) => v.id === r.id)}>Resolver</Button>
                      </ConfirmAction>
                      <ConfirmAction
                        title="Arquivar a denúncia sem providência?"
                        description="Use quando ela não procede. Diga por quê: o motivo fica registrado."
                        confirmLabel="Arquivar"
                        reason={{ label: 'Por que não procede', required: true, minLength: 3 }}
                        onConfirm={(resolution) => update.mutateAsync({ id: r.id, status: 'dismissed', resolution })}
                      >
                        <Button size="sm" variant="outline" loading={pendingFor(update, (v) => v.id === r.id && v.status === 'dismissed')} disabled={pendingFor(update, (v) => v.id === r.id)}>Arquivar</Button>
                      </ConfirmAction>
                    </>
                  )}
                  <HistoryButton type="report" id={r.id} title={`Denúncia contra ${r.targetName}`} />
                </div>
              </li>
            ))}
          </ul>
          <Pager page={page} total={list.data.total} pageSize={list.data.pageSize} onPage={(p) => set({ page: String(p) })} noun={['denúncia', 'denúncias']} />
        </>
      )}
    </div>
  );
}

export default function ReportsPage() { return <Suspense fallback={<Loading />}><Reports /></Suspense>; }
