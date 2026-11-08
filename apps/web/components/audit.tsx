'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileClock } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { auditActionInfo, auditActionLabel, AUDIT_TARGET_LABELS, type AuditChange, type AuditTone } from '@ergatis/shared';
import { Pager } from '@/components/list-ui';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { DESKTOP, useMediaQuery } from '@/hooks/use-media-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface AuditPerson { id: string; name: string; email: string }
export interface AuditEntry {
  id: string; requestId: string | null; action: string; targetType: string; targetId: string | null;
  actorRole: string | null; summary: string | null; changes: AuditChange[] | null;
  metadata: Record<string, unknown> | null; createdAt: string;
  actor: AuditPerson | null; targetUser: AuditPerson | null;
}

const TONE: Record<AuditTone, string> = {
  neutral: 'bg-muted text-foreground',
  positive: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  change: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  danger: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

export function AuditActionBadge({ action }: { action: string }) {
  const tone = auditActionInfo(action)?.tone ?? 'neutral';
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONE[tone])}>
      {auditActionLabel(action)}
    </span>
  );
}

/** Nomes legíveis dos campos que aparecem em `changes`. */
const FIELD_LABELS: Record<string, string> = {
  displayName: 'Nome exibido', phone: 'Telefone', bio: 'Sobre', city: 'Cidade', state: 'Estado',
  latitude: 'Latitude', longitude: 'Longitude', emailNotifications: 'Avisos por e-mail',
  headline: 'Título profissional', serviceRadiusKm: 'Raio de atendimento (km)', categoryIds: 'Categorias',
  role: 'Papel', banned: 'Banido', banReason: 'Motivo do banimento',
  status: 'Situação', resolution: 'Resolução', currentPeriodEnd: 'Fim do período', cancelledAt: 'Cancelada em',
  name: 'Nome', priceCents: 'Preço (centavos)', entitlements: 'Benefícios', active: 'Ativo',
};

const ROLE_LABELS: Record<string, string> = { admin: 'Admin', user: 'Usuário' };

const show = (v: unknown) => {
  if (v === null || v === undefined || v === '') return <span className="text-muted-foreground">vazio</span>;
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString('pt-BR');
  return typeof v === 'object' ? <code className="text-xs break-all">{JSON.stringify(v)}</code> : String(v);
};

export const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const personLabel = (p: AuditPerson | null, role?: string | null) =>
  p ? `${p.name}${role ? ` · ${ROLE_LABELS[role] ?? role}` : ''}` : 'Sistema';

export const targetLabel = (e: Pick<AuditEntry, 'targetType' | 'targetId' | 'targetUser'>) =>
  e.targetUser ? e.targetUser.name : `${AUDIT_TARGET_LABELS[e.targetType] ?? e.targetType}${e.targetId ? ` ${e.targetId.slice(0, 8)}` : ''}`;

export function AuditChanges({ changes }: { changes: AuditChange[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-muted-foreground text-left text-xs">
        <tr><th className="py-1 pr-2 font-medium">Campo</th><th className="py-1 pr-2 font-medium">Antes</th><th className="py-1 font-medium">Depois</th></tr>
      </thead>
      <tbody className="divide-y">
        {changes.map((c) => (
          <tr key={c.field} className="align-top">
            <td className="py-1.5 pr-2 font-medium">{FIELD_LABELS[c.field] ?? c.field}</td>
            <td className="text-muted-foreground py-1.5 pr-2 line-through decoration-1">{show(c.from)}</td>
            <td className="py-1.5">{show(c.to)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Metadados sem os campos de origem, que têm bloco próprio. */
const ORIGIN_KEYS = new Set(['ip', 'userAgent', 'method', 'route', 'origin']);

export function AuditDetail({ entry }: { entry: AuditEntry }) {
  const meta = entry.metadata ?? {};
  const extra = Object.entries(meta).filter(([k, v]) => !ORIGIN_KEYS.has(k) && v !== null && v !== undefined && v !== '');
  return (
    <div className="space-y-5 text-sm">
      {entry.summary && <p>{entry.summary}</p>}
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Quando</dt><dd>{when(entry.createdAt)}</dd>
        <dt className="text-muted-foreground">Quem</dt><dd>{entry.actor ? `${personLabel(entry.actor, entry.actorRole)} (${entry.actor.email})` : 'Sistema'}</dd>
        <dt className="text-muted-foreground">Alvo</dt><dd>{entry.targetUser ? `${entry.targetUser.name} (${entry.targetUser.email})` : targetLabel(entry)}</dd>
      </dl>
      {entry.changes && entry.changes.length > 0 && (
        <section><h3 className="mb-1 font-medium">O que mudou</h3><AuditChanges changes={entry.changes} /></section>
      )}
      {extra.length > 0 && (
        <section>
          <h3 className="mb-1 font-medium">Detalhes</h3>
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
            {extra.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground break-all">{k}</dt><dd>{show(v)}</dd></div>)}
          </dl>
        </section>
      )}
      <section>
        <h3 className="mb-1 font-medium">Origem</h3>
        <dl className="text-muted-foreground grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
          {meta.origin ? <><dt>Origem</dt><dd>Tarefa do sistema</dd></> : <>
            <dt>IP</dt><dd>{String(meta.ip ?? '—')}</dd>
            <dt>Requisição</dt><dd>{meta.method ? `${String(meta.method)} ${String(meta.route ?? '')}` : '—'}</dd>
            <dt>Navegador</dt><dd className="break-all">{String(meta.userAgent ?? '—')}</dd>
          </>}
        </dl>
      </section>
    </div>
  );
}

interface HistoryPage { items: AuditEntry[]; total: number; page: number; pageSize: number }

/** Tipos de registro com histórico (espelha HISTORY_ACCESS na API). */
export type HistoryType = 'user' | 'report' | 'subscription' | 'plan' | 'service_request' | 'proposal' | 'engagement';

function HistoryList({ type, id, items, onSelect }: { type: HistoryType; id: string; items: AuditEntry[]; onSelect: (e: AuditEntry) => void }) {
  return (
    <ol className="divide-y rounded-lg border text-sm">
      {items.map((e) => (
        <li key={e.id}>
          <button type="button" onClick={() => onSelect(e)} className="hover:bg-muted/50 flex min-h-14 w-full items-start justify-between gap-3 p-3 text-left">
            <span className="min-w-0 space-y-1">
              <AuditActionBadge action={e.action} />
              <span className="text-muted-foreground block text-xs">
                {type === 'user' && e.actor?.id === id ? 'Pela própria pessoa' : `Por ${personLabel(e.actor, e.actorRole)}`}
                {e.summary ? ` · ${e.summary}` : e.changes?.length ? ` · ${e.changes.length} ${e.changes.length === 1 ? 'campo' : 'campos'}` : ''}
              </span>
            </span>
            <time className="text-muted-foreground shrink-0 text-xs">{when(e.createdAt)}</time>
          </button>
        </li>
      ))}
    </ol>
  );
}

function useHistory(type: HistoryType, id: string, page: number, enabled = true) {
  return useQuery({
    queryKey: ['history', type, id, page],
    queryFn: () => api<HistoryPage>(`/admin/history/${type}/${encodeURIComponent(id)}?page=${page}`),
    enabled,
    placeholderData: keepPreviousData,
  });
}

function DetailSheet({ entry, onClose }: { entry: AuditEntry | null; onClose: () => void }) {
  return (
    <Sheet open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {entry && (
          <>
            <SheetHeader>
              <SheetTitle><AuditActionBadge action={entry.action} /></SheetTitle>
              <SheetDescription className="font-mono text-xs">{entry.action}</SheetDescription>
            </SheetHeader>
            <AuditDetail entry={entry} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Bloco de histórico dentro de uma página (ex.: o usuário no admin). A permissão
 * segue o tipo do registro; "Ver tudo" leva à auditoria só para quem a vê.
 */
export function RecordHistory({ type, id, limit = 8, auditLink }: { type: HistoryType; id: string; limit?: number; auditLink?: string }) {
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const q = useHistory(type, id, 1);
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Histórico{q.data ? ` (${q.data.total})` : ''}</h2>
        {auditLink ? <Link href={auditLink} className="text-primary text-sm hover:underline">Abrir na auditoria</Link>
          : q.data && q.data.total > limit && <HistoryButton type={type} id={id} title="Histórico completo" label="Ver tudo" />}
      </div>
      {q.isPending ? <Skeleton className="h-24" /> : q.error ? <p role="alert" className="text-destructive text-sm">{q.error.message}</p>
        : q.data.items.length === 0 ? <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">Nada registrado.</p>
        : <HistoryList type={type} id={id} items={q.data.items.slice(0, limit)} onSelect={setSelected} />}
      <DetailSheet entry={selected} onClose={() => setSelected(null)} />
    </section>
  );
}

/** Botão "Histórico" para qualquer registro: abre a linha do tempo num painel, paginada. */
export function HistoryButton({ type, id, title, label = 'Histórico' }: { type: HistoryType; id: string; title: string; label?: string }) {
  const desktop = useMediaQuery(DESKTOP);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const q = useHistory(type, id, page, open);
  return (
    <>
      <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setOpen(true)}><FileClock /> {label}</Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={desktop ? 'right' : 'bottom'} className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><FileClock className="size-5" aria-hidden /> Histórico</SheetTitle>
            <SheetDescription>{title}</SheetDescription>
          </SheetHeader>
          {q.isPending ? <Skeleton className="h-40" /> : q.error ? <p role="alert" className="text-destructive text-sm">{q.error.message}</p>
            : q.data.items.length === 0 ? <p className="text-muted-foreground py-8 text-center text-sm">Nada registrado.</p>
            : (
              <div className={cn('space-y-3', q.isPlaceholderData && 'opacity-60')}>
                <HistoryList type={type} id={id} items={q.data.items} onSelect={setSelected} />
                {q.data.total > q.data.pageSize && <Pager page={page} total={q.data.total} pageSize={q.data.pageSize} onPage={setPage} noun={['evento', 'eventos']} />}
              </div>
            )}
        </SheetContent>
      </Sheet>
      <DetailSheet entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}
