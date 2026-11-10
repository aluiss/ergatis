'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Handshake, MessageCircle, PlusCircle, Search, ShieldAlert, Star } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { DASHBOARD_PERIODS, type Dashboard, type DashboardPeriod, type VerificationStatusView } from '@ergatis/shared';
import { ErrorState } from '@/components/app-ui';
import { FilterChips } from '@/components/list-ui';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useListParams } from '@/hooks/use-list-params';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Me { profile: { displayName: string } }

const pct = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 0 }));

/**
 * Um número com rótulo. `now`: retrata o momento, não o período escolhido. Com
 * `href`, o cartão inteiro leva à lista correspondente.
 */
function Kpi({ label, value, hint, href, now, emphasis, className }: {
  label: string; value: string | number; hint?: string; href?: string; now?: boolean; emphasis?: boolean; className?: string;
}) {
  const body = (
    <>
      <span className="text-muted-foreground flex items-center justify-between gap-1 text-xs leading-tight sm:text-sm">
        {label}
        {now && <span className="bg-muted rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">agora</span>}
      </span>
      <span className={cn('mt-1 block text-2xl font-bold tabular-nums sm:text-3xl', emphasis && 'text-primary')}>{value}</span>
      {(hint || href) && (
        <span className="text-muted-foreground mt-1 flex items-center justify-between gap-1 text-xs">
          <span>{hint}</span>
          {href && <ChevronRight className="size-4 shrink-0" aria-hidden />}
        </span>
      )}
    </>
  );
  const cls = cn('bg-card flex min-h-28 flex-col rounded-xl border p-3 sm:p-4', className);
  return href
    ? <Link href={href} className={cn(cls, 'hover:border-primary/40 hover:bg-muted/30 transition-colors')}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

/** Faixa de "o que pede atenção". Só aparece com algo dentro. */
function Pending({ items }: { items: { href: string; icon: typeof Handshake; text: string }[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="pendente" className="space-y-2">
      <h2 id="pendente" className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Em andamento</h2>
      <ul className="divide-y rounded-xl border">
        {items.map(({ href, icon: Icon, text }) => (
          <li key={href + text}>
            <Link href={href} className="hover:bg-muted/50 flex min-h-12 items-center gap-3 px-3 py-2 text-sm">
              <Icon className="text-primary size-5 shrink-0" aria-hidden />
              <span className="flex-1">{text}</span>
              <ChevronRight className="text-muted-foreground size-4" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function ProfessionalView({ d }: { d: Dashboard }) {
  const p = d.professional!;
  const v = useQuery({ queryKey: ['verification'], queryFn: () => api<VerificationStatusView>('/verification/me') });
  const limitLeft = p.proposals.limit === null ? null : Math.max(0, p.proposals.limit - p.proposals.used);
  return (
    <div className="space-y-5">
      {v.data && !v.data.canPropose && (
        <Link href="/perfil#verificacao" className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <ShieldAlert className="size-5 shrink-0" aria-hidden />
          <span className="flex-1">{v.data.blockedReason}</span>
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Pedidos recebidos" value={p.received} hint="nas suas categorias" />
        <Kpi label="Oportunidades abertas" value={p.openNow} hint="ver lista" href="/oportunidades" now emphasis={p.openNow > 0} />
        <Kpi label="Propostas em análise" value={p.inAnalysis} hint="aguardando o cliente" href="/propostas" now />
        <Kpi label="Pedidos atendidos" value={pct(p.attendanceRate)} hint={`${p.attended} de ${p.received} recebidos`} />
        <Kpi label="Valor ganho" value={money(p.earnedCents)} hint="em serviços concluídos" />
        <Kpi
          label="Sua nota" value={p.rating.average === null ? '—' : p.rating.average.toFixed(1)}
          hint={p.rating.total ? plural(p.rating.total, 'avaliação', 'avaliações') : 'sem avaliações ainda'}
        />
      </div>
      <Pending items={[
        ...(d.activeEngagements.asProfessional ? [{ href: '/contratacoes', icon: Handshake, text: plural(d.activeEngagements.asProfessional, 'serviço em andamento', 'serviços em andamento') }] : []),
        ...(d.unreadMessages ? [{ href: '/mensagens', icon: MessageCircle, text: plural(d.unreadMessages, 'mensagem não lida', 'mensagens não lidas') }] : []),
        // Só quando o limite está perto de acabar: antes disso é ruído.
        ...(limitLeft !== null && limitLeft <= 2 ? [{ href: '/planos', icon: Star, text: limitLeft === 0 ? 'Limite de propostas do mês atingido. Ver planos' : `Restam ${plural(limitLeft, 'proposta', 'propostas')} neste mês` }] : []),
      ]} />
      <Button asChild size="lg" className="h-12 w-full text-base sm:w-auto"><Link href="/oportunidades"><Search /> Ver oportunidades</Link></Button>
    </div>
  );
}

function ClientView({ d }: { d: Dashboard }) {
  const c = d.client;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Pedidos publicados" value={c.published} />
        <Kpi label="Pedidos em análise" value={c.inAnalysis} hint="recebendo propostas" href="/pedidos?status=open" now emphasis={c.inAnalysis > 0} />
        <Kpi label="Pedidos concluídos" value={c.completed} hint="dos publicados no período" />
        <Kpi label="Taxa de conclusão" value={pct(c.completionRate)} hint={`${c.completed} de ${c.published} publicados`} />
        {/* Quinto cartão: ocupa a linha toda no celular, sem buraco ao lado. */}
        <Kpi label="Mensagens não lidas" value={d.unreadMessages} hint="abrir conversas" href="/mensagens" now emphasis={d.unreadMessages > 0} className="col-span-2 lg:col-span-1" />
      </div>
      <Pending items={d.activeEngagements.asClient ? [{ href: '/contratacoes', icon: Handshake, text: plural(d.activeEngagements.asClient, 'contratação em andamento', 'contratações em andamento') }] : []} />
      <Button asChild size="lg" className="h-12 w-full text-base sm:w-auto"><Link href="/pedidos/novo"><PlusCircle /> Publicar pedido</Link></Button>
    </div>
  );
}

function Panel() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me') });
  const { values, set } = useListParams(['period', 'visao'] as const, { period: 'month' });
  const period = (values.period in DASHBOARD_PERIODS ? values.period : 'month') as DashboardPeriod;
  const q = useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => api<Dashboard>(`/dashboard?period=${period}`),
    placeholderData: keepPreviousData,
  });
  const isPro = !!q.data?.professional;
  // Quem é as duas coisas começa pela visão de profissional, que é a que gera renda.
  const view = isPro && values.visao !== 'cliente' ? 'profissional' : 'cliente';

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Olá{me.data ? `, ${me.data.profile.displayName.split(' ')[0]}` : ''}</h1>

      {isPro && (
        <div role="tablist" aria-label="Visão" className="bg-muted grid grid-cols-2 rounded-lg p-1 sm:inline-grid">
          {([['profissional', 'Como profissional'], ['cliente', 'Como cliente']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => set({ visao: id === 'profissional' ? '' : id })}
              className={cn('h-10 rounded-md px-4 text-sm font-medium', view === id ? 'bg-background shadow-sm' : 'text-muted-foreground')}>{label}</button>
          ))}
        </div>
      )}

      <FilterChips label="Período" value={period} onChange={(p) => set({ period: p || 'month' })}
        options={Object.entries(DASHBOARD_PERIODS) as [DashboardPeriod, string][]} />

      {q.isPending ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : q.error ? <ErrorState error={q.error} /> : (
        <div className={cn('transition-opacity', q.isPlaceholderData && 'opacity-60')} aria-busy={q.isPlaceholderData}>
          {view === 'profissional' ? <ProfessionalView d={q.data} /> : <ClientView d={q.data} />}
        </div>
      )}

      {q.data && !isPro && (
        <Link href="/perfil#perfil-profissional" className="text-muted-foreground hover:text-foreground block text-sm underline-offset-2 hover:underline">
          Também oferece serviços? Crie seu perfil profissional.
        </Link>
      )}
    </div>
  );
}

export default function PanelPage() { return <Suspense><Panel /></Suspense>; }
