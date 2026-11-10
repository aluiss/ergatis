'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Suspense } from 'react';
import { FilterChips } from '@/components/list-ui';
import { useListParams } from '@/hooks/use-list-params';
import Link from 'next/link';
import { Empty, ErrorState, Loading } from '@/components/app-ui';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert } from 'lucide-react';
import type { VerificationStatusView } from '@ergatis/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { money } from '@/lib/format';

interface Item {
  id: string; title: string; description: string; city: string; state: string;
  budgetCents: number | null; urgent: boolean; alreadyProposed: boolean;
  /** Perfil da pessoa em que o pedido se encaixa. */
  profileId: string; profileTitle: string;
}
interface Me { professional: { profiles: { id: string; title: string }[] } | null }

function Opportunities() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me') });
  const profiles = me.data?.professional?.profiles ?? [];
  const { values, set } = useListParams(['perfil'] as const);
  // Perfil removido ou de outra pessoa na URL: volta para todos.
  const profileId = profiles.some((p) => p.id === values.perfil) ? values.perfil : '';
  const q = useQuery({
    queryKey: ['feed', profileId],
    queryFn: () => api<Item[]>(`/requests/feed${profileId ? `?profileId=${profileId}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const v = useQuery({ queryKey: ['verification'], queryFn: () => api<VerificationStatusView>('/verification/me') });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Oportunidades</h1>
      {/* Antes de escolher um pedido, a pessoa sabe se pode propor. */}
      {v.data && !v.data.canPropose && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p className="flex items-start gap-2"><ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />{v.data.blockedReason}</p>
          <Button asChild className="h-11 shrink-0 sm:h-9"><Link href="/perfil#verificacao">Verificar identidade</Link></Button>
        </div>
      )}
      {v.data?.inGrace && v.data.graceUntil && (
        <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-200">
          Até {new Date(v.data.graceUntil).toLocaleDateString('pt-BR')} você pode propor sem verificação. <Link className="font-medium underline underline-offset-2" href="/perfil#verificacao">Verifique agora</Link> para não ser interrompido.
        </p>
      )}
      {profiles.length > 1 && (
        <FilterChips label="Perfil profissional" value={profileId} onChange={(perfil) => set({ perfil })}
          options={[['', 'Todos os perfis'], ...profiles.map((p) => [p.id, p.title] as const)]} />
      )}
      {q.isPending ? <Loading /> : q.error ? (
        <Empty>{q.error.message}. <Link className="text-primary" href="/perfil">Ir para o perfil</Link></Empty>
      ) : q.data.length === 0 ? <Empty>{profileId ? 'Nenhum pedido aberto para este perfil agora.' : 'Nenhum pedido aberto nas suas categorias agora.'}</Empty> : (
        <ul className={`divide-y rounded-lg border ${q.isPlaceholderData ? 'opacity-60' : ''}`}>
          {q.data.map((r) => (
            <li key={r.id}>
              <Link href={`/pedidos/${r.id}`} className="hover:bg-muted block p-3">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {r.title}
                  {r.urgent && <Badge variant="destructive">Urgente</Badge>}
                  {r.alreadyProposed && <Badge variant="secondary">Proposta enviada</Badge>}
                </span>
                <span className="text-muted-foreground block text-sm">{r.city} - {r.state}{r.budgetCents ? ` · ${money(r.budgetCents)}` : ''}</span>
                {profiles.length > 1 && !profileId && <span className="text-primary mt-1 block text-xs font-medium">{r.profileTitle}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function OpportunitiesPage() { return <Suspense fallback={<Loading />}><Opportunities /></Suspense>; }
