'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, RotateCcw, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AUDIT_ACTIONS, AUDIT_GROUPS, AUDIT_MIN_RETENTION_MONTHS, type AuditGroup } from '@ergatis/shared';
import { Empty, ErrorState, Loading } from '@/components/app-ui';
import { AuditActionBadge, AuditDetail, personLabel, targetLabel, when, type AuditEntry } from '@/components/audit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { api } from '@/lib/api';

interface Result { items: AuditEntry[]; total: number; page: number; pageSize: number }

/** Filtros que viajam na URL: o link da tela filtrada pode ser enviado a outra pessoa. */
const FILTER_KEYS = ['q', 'group', 'action', 'from', 'to', 'userId', 'requestId', 'targetType', 'targetId'] as const;

const ACTIONS_BY_GROUP = Object.entries(AUDIT_GROUPS).map(([group, label]) => ({
  group, label,
  actions: Object.entries(AUDIT_ACTIONS).filter(([, a]) => a.group === group).map(([key, a]) => ({ key, label: a.label })),
}));

function AuditPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ''])) as Record<(typeof FILTER_KEYS)[number], string>;
  const page = Number(params.get('page') ?? '1') || 1;
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));

  const setParams = (next: Partial<Record<string, string>>, resetPage = true) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v) merged.set(k, v); else merged.delete(k); }
    if (resetPage) merged.delete('page');
    router.replace(`${pathname}?${merged}`, { scroll: false });
  };

  const list = useQuery({
    queryKey: ['admin-audit', query.toString(), page],
    queryFn: () => api<Result>(`/admin/audit-logs?${new URLSearchParams([...query, ['page', String(page)]])}`),
    // A tabela anterior fica à vista enquanto a próxima página carrega.
    placeholderData: keepPreviousData,
  });

  const hasFilters = query.toString() !== '';
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  const scoped = filters.userId || filters.requestId || filters.targetId;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Auditoria</h1>
        <p className="text-muted-foreground text-sm">
          Quem fez o quê, quando e de onde. Os registros ficam guardados por pelo menos {AUDIT_MIN_RETENTION_MONTHS} meses.
        </p>
      </div>

      <form
        className="bg-card grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-[1fr_11rem_14rem_9.5rem_9.5rem_auto]"
        onSubmit={(e) => { e.preventDefault(); setParams({ q: String(new FormData(e.currentTarget).get('q') ?? '').trim() }); }}
      >
        <div className="space-y-1">
          <Label htmlFor="audit-q">Buscar</Label>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" />
            <Input id="audit-q" name="q" key={filters.q} defaultValue={filters.q} className="pl-8" placeholder="Pessoa, e-mail ou descrição" />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-group">Área</Label>
          <Select id="audit-group" value={filters.group} onChange={(e) => setParams({ group: e.target.value, action: '' })}>
            <option value="">Todas</option>
            {Object.entries(AUDIT_GROUPS).map(([g, label]) => <option key={g} value={g}>{label}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-action">Ação</Label>
          <Select id="audit-action" value={filters.action} onChange={(e) => setParams({ action: e.target.value })}>
            <option value="">Todas</option>
            {ACTIONS_BY_GROUP.filter((g) => !filters.group || g.group === (filters.group as AuditGroup)).map((g) => (
              <optgroup key={g.group} label={g.label}>
                {g.actions.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </optgroup>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-from">De</Label>
          <Input id="audit-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => setParams({ from: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-to">Até</Label>
          <Input id="audit-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setParams({ to: e.target.value })} />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">Filtrar</Button>
          {hasFilters && (
            <Button type="button" variant="ghost" onClick={() => router.replace(pathname)}><RotateCcw /> Limpar</Button>
          )}
        </div>
      </form>

      {scoped && (
        <p className="bg-muted rounded-md px-3 py-2 text-sm">
          {filters.requestId ? 'Mostrando tudo o que uma única requisição registrou.' : filters.userId ? 'Mostrando o que esta pessoa fez e o que foi feito com ela.' : 'Mostrando o histórico de um registro.'}{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => setParams({ userId: '', requestId: '', targetId: '', targetType: '' })}>Ver todos</button>
        </p>
      )}

      {list.isPending ? <Loading /> : list.error ? <ErrorState error={list.error} /> : list.data.items.length === 0 ? (
        <Empty>{hasFilters ? 'Nenhum registro para estes filtros.' : 'Nenhum registro ainda.'}</Empty>
      ) : (
        <>
          <div className={`overflow-x-auto rounded-lg border ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
                <tr>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Quando</th>
                  <th className="px-3 py-2 font-medium">Ação</th>
                  <th className="px-3 py-2 font-medium">Quem</th>
                  <th className="px-3 py-2 font-medium">Alvo</th>
                  <th className="px-3 py-2 font-medium">O que aconteceu</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.data.items.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/50 cursor-pointer align-top" onClick={() => setSelected(e)}>
                    <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">{when(e.createdAt)}</td>
                    <td className="px-3 py-2"><AuditActionBadge action={e.action} /></td>
                    <td className="px-3 py-2">{personLabel(e.actor, e.actorRole)}</td>
                    <td className="px-3 py-2">{targetLabel(e)}</td>
                    <td className="px-3 py-2">
                      {/* O botão dá acesso pelo teclado; a linha inteira continua clicável. */}
                      <button type="button" className="text-left hover:underline" onClick={(ev) => { ev.stopPropagation(); setSelected(e); }}>
                        {e.summary ?? (e.changes?.length ? `${e.changes.length} ${e.changes.length === 1 ? 'campo alterado' : 'campos alterados'}` : 'Ver detalhes')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) }, false)}>Anterior</Button>
              <span>Página {page} de {pages} · {list.data.total} {list.data.total === 1 ? 'registro' : 'registros'}</span>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setParams({ page: String(page + 1) }, false)}>Próxima</Button>
            </div>
            <Button asChild size="sm" variant="outline">
              {/* Download direto: o navegador manda o cookie de sessão; a exportação fica registrada. */}
              <a href={`/api/admin/audit-logs/export?${query}`} download><Download /> Exportar CSV</a>
            </Button>
          </div>
        </>
      )}

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent>
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle><AuditActionBadge action={selected.action} /></SheetTitle>
                <SheetDescription className="font-mono text-xs">{selected.action}</SheetDescription>
              </SheetHeader>
              <AuditDetail entry={selected} />
              <div className="flex flex-wrap gap-2 border-t pt-4">
                {selected.requestId && (
                  <Button size="sm" variant="outline" onClick={() => { setParams({ requestId: selected.requestId! }); setSelected(null); }}>
                    Tudo desta requisição
                  </Button>
                )}
                {(selected.targetUser ?? selected.actor) && (
                  <Button size="sm" variant="outline" onClick={() => { setParams({ userId: (selected.targetUser ?? selected.actor)!.id }); setSelected(null); }}>
                    Histórico de {(selected.targetUser ?? selected.actor)!.name}
                  </Button>
                )}
                {(selected.targetUser ?? selected.actor) && (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/admin/usuarios/${(selected.targetUser ?? selected.actor)!.id}`}>Abrir usuário</Link>
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function AdminAudit() {
  return <Suspense fallback={<Loading />}><AuditPage /></Suspense>;
}
