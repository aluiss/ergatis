'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Suspense } from 'react';
import { HistoryButton } from '@/components/audit';
import { Pager, SearchBar } from '@/components/list-ui';
import { useListParams } from '@/hooks/use-list-params';
import { date } from '@/lib/format';
import { Empty, ErrorState, Loading, pendingFor, post, useAction } from '@/components/app-ui';
import { ConfirmAction } from '@/components/confirm-action';
import { useAccess } from '@/components/access-provider';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface Face { livenessScore: number | null; documentMatchScore: number | null; capturedAt: string | null; selfieFileId: string | null }
interface Item { userId: string; name: string; email: string; headline: string; requestedAt: string; documents: { id: string }[]; face: Face | null }
interface Result { items: Item[]; total: number; pageSize: number }

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
/** Cor da nota: o limiar padrão da API é 90%. Abaixo disso, a moderação olha com mais cuidado. */
const tone = (n: number | null) => (n === null ? 'text-muted-foreground' : n >= 0.9 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400');

function FaceSummary({ face, canSee, name }: { face: Face | null; canSee: boolean; name: string }) {
  if (!face?.capturedAt) return <p className="text-destructive text-xs">Sem reconhecimento facial: não dá para aprovar.</p>;
  return (
    <div className="flex items-center gap-3">
      {canSee && face.selfieFileId && (
        // Cada abertura da selfie fica na auditoria, como a do documento.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/files/${face.selfieFileId}`} alt={`Selfie de ${name}`} className="size-16 shrink-0 rounded-lg object-cover" />
      )}
      <dl className="grid grid-cols-[auto_auto] gap-x-3 text-xs">
        <dt className="text-muted-foreground">Prova de vida</dt><dd className={tone(face.livenessScore)}>{pct(face.livenessScore)}</dd>
        <dt className="text-muted-foreground">Semelhança com o documento</dt>
        <dd className={tone(face.documentMatchScore)}>{face.documentMatchScore === null ? 'não comparado (documento em PDF?)' : pct(face.documentMatchScore)}</dd>
      </dl>
    </div>
  );
}

function Verifications() {
  const { can } = useAccess();
  const { values, page, set, query } = useListParams(['q'] as const);
  const q = useQuery({
    queryKey: ['admin-verifications', query()],
    queryFn: () => api<Result>(`/admin/verifications?${query()}`),
    placeholderData: keepPreviousData,
  });
  const decide = useAction(({ id, approved }: { id: string; approved: boolean }) =>
    post(`/admin/verifications/${id}`, { approved }), { invalidate: ['admin-verifications'], success: 'Decisão registrada.' });
  return (
    <div className="space-y-4">
    <h1 className="text-2xl font-bold">Verificações</h1>
    <SearchBar value={values.q} onSearch={(v) => set({ q: v })} placeholder="Nome ou e-mail" />
    <p className="text-muted-foreground text-sm">
      Compare a selfie com a foto do documento. As notas vêm do provedor de reconhecimento facial e apoiam, não substituem, a sua análise.
      Cada abertura de documento ou selfie fica na auditoria; tudo é apagado ao aprovar ou recusar. Apague cópias baixadas após a análise.
    </p>
    {q.isPending ? <Loading /> : q.error ? <ErrorState error={q.error} /> : q.data.items.length === 0 ? (
      <Empty>{values.q ? 'Ninguém com essa busca na fila.' : 'Nenhuma verificação pendente.'}</Empty>
    ) : (<>
    <ul className={`divide-y rounded-lg border text-sm ${q.isPlaceholderData ? 'opacity-60' : ''}`}>
      {q.data.items.map((v) => (
        <li key={v.userId} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span>
            <b>{v.name}</b><span className="text-muted-foreground block">{v.email} · {v.headline}</span>
            <span className="text-muted-foreground block text-xs">Pedido em {date(v.requestedAt)}</span>
            <span className="mt-2 block"><FaceSummary face={v.face} canSee={can('documents.view', 'edit')} name={v.name} /></span>
            <span className="mt-1 block"><HistoryButton type="user" id={v.userId} title={v.name} /></span>
            <span className="mt-1 flex flex-wrap gap-3">
              {can('documents.view', 'edit')
                ? v.documents.map((d, i) => <a key={d.id} className="text-primary" href={`/api/files/${d.id}`}>Baixar documento {i + 1}</a>)
                : <span className="text-muted-foreground text-xs">{v.documents.length} documento(s). Você não tem permissão para abrir documentos.</span>}
            </span>
          </span>
          {can('admin.verifications', 'edit') && <span className="flex gap-2">
            <ConfirmAction
              title={`Aprovar a verificação de ${v.name}?`}
              description="O perfil ganha o selo de verificado e passa a poder enviar propostas. Documentos e selfie são apagados; fica só o modelo facial no provedor."
              confirmLabel="Aprovar"
              onConfirm={() => decide.mutateAsync({ id: v.userId, approved: true })}
            >
              <Button size="sm" loading={pendingFor(decide, (d) => d.id === v.userId && d.approved)} disabled={!v.face?.capturedAt || pendingFor(decide, (d) => d.id === v.userId)}>Aprovar</Button>
            </ConfirmAction>
            <ConfirmAction
              title={`Recusar a verificação de ${v.name}?`}
              description="Documentos, selfie e o modelo facial são apagados. A pessoa poderá fazer tudo de novo."
              confirmLabel="Recusar" destructive
              onConfirm={() => decide.mutateAsync({ id: v.userId, approved: false })}
            >
              <Button size="sm" variant="outline" loading={pendingFor(decide, (d) => d.id === v.userId && !d.approved)} disabled={pendingFor(decide, (d) => d.id === v.userId)}>Recusar</Button>
            </ConfirmAction>
          </span>}
        </li>
      ))}
    </ul>
    <Pager page={page} total={q.data.total} pageSize={q.data.pageSize} onPage={(p) => set({ page: String(p) })} noun={['pedido', 'pedidos']} />
    </>)}
    </div>
  );
}

export default function AdminVerifications() { return <Suspense fallback={<Loading />}><Verifications /></Suspense>; }
