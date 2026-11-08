'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Empty, ErrorState, Loading, pendingFor, StatusBadge, useAction } from '@/components/app-ui';
import { ConfirmAction } from '@/components/confirm-action';
import { useAccess } from '@/components/access-provider';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

interface Item { id: string; targetUserId: string; reason: string; status: string; createdAt: string }

export default function AdminReports() {
  const { can } = useAccess();
  const q = useQuery({ queryKey: ['admin-reports'], queryFn: () => api<Item[]>('/admin/reports') });
  const update = useAction(({ id, status, resolution }: { id: string; status: string; resolution?: string }) =>
    api(`/admin/reports/${id}`, { method: 'PATCH', body: { status, resolution } }), { invalidate: ['admin-reports'], success: 'Denúncia atualizada.' });
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
          {['open', 'reviewing'].includes(r.status) && can('admin.reports', 'edit') && (
            <div className="flex gap-2">
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
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
