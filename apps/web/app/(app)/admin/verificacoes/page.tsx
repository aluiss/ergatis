'use client';

import { useQuery } from '@tanstack/react-query';
import { Empty, ErrorState, Loading, pendingFor, post, useAction } from '@/components/app-ui';
import { ConfirmAction } from '@/components/confirm-action';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface Item { userId: string; name: string; email: string; headline: string; documents: { id: string }[] }

export default function AdminVerifications() {
  const q = useQuery({ queryKey: ['admin-verifications'], queryFn: () => api<Item[]>('/admin/verifications') });
  const decide = useAction(({ id, approved }: { id: string; approved: boolean }) =>
    post(`/admin/verifications/${id}`, { approved }), { invalidate: ['admin-verifications'], success: 'Decisão registrada.' });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  if (q.data.length === 0) return <Empty>Nenhuma verificação pendente.</Empty>;
  return (
    <div className="space-y-3">
    <p className="text-muted-foreground text-sm">Cada download fica registrado na auditoria. Os documentos são apagados ao aprovar ou recusar. Apague a cópia baixada após a análise.</p>
    <ul className="divide-y rounded-lg border text-sm">
      {q.data.map((v) => (
        <li key={v.userId} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span>
            <b>{v.name}</b><span className="text-muted-foreground block">{v.email} · {v.headline}</span>
            <span className="mt-1 flex flex-wrap gap-3">
              {v.documents.map((d, i) => <a key={d.id} className="text-primary" href={`/api/files/${d.id}`}>Baixar documento {i + 1}</a>)}
            </span>
          </span>
          <span className="flex gap-2">
            <ConfirmAction
              title={`Aprovar a verificação de ${v.name}?`}
              description="O perfil ganha o selo de verificado, e os documentos enviados são apagados."
              confirmLabel="Aprovar"
              onConfirm={() => decide.mutateAsync({ id: v.userId, approved: true })}
            >
              <Button size="sm" loading={pendingFor(decide, (d) => d.id === v.userId && d.approved)} disabled={pendingFor(decide, (d) => d.id === v.userId)}>Aprovar</Button>
            </ConfirmAction>
            <ConfirmAction
              title={`Recusar a verificação de ${v.name}?`}
              description="Os documentos são apagados. A pessoa poderá enviar outros e pedir de novo."
              confirmLabel="Recusar" destructive
              onConfirm={() => decide.mutateAsync({ id: v.userId, approved: false })}
            >
              <Button size="sm" variant="outline" loading={pendingFor(decide, (d) => d.id === v.userId && !d.approved)} disabled={pendingFor(decide, (d) => d.id === v.userId)}>Recusar</Button>
            </ConfirmAction>
          </span>
        </li>
      ))}
    </ul>
    </div>
  );
}
