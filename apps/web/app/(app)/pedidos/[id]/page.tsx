'use client';

import { useQuery } from '@tanstack/react-query';
import { Crown, Lock, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ErrorState, Loading, post, StatusBadge, useAction } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { money } from '@/lib/format';

interface Proposal {
  id: string; professionalId: string; amountCents: number; message: string; status: string;
  displayName: string; headline: string; badge: boolean; ratingAverage: number | null;
}
interface Detail {
  id: string; title: string; description: string; city: string; state: string; status: string;
  budgetCents: number | null; urgent: boolean;
  proposals?: Proposal[];
  clientRating?: { average: number | null; total: number } | null;
  clientRatingLocked?: boolean;
  myProposal?: { amountCents: number; status: string } | null;
}

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useQuery({ queryKey: ['request', id], queryFn: () => api<Detail>(`/requests/${id}`) });
  const keys = { invalidate: ['request', 'requests', 'me'] };
  const accept = useAction((pid: string) => post(`/proposals/${pid}/accept`), { ...keys, success: 'Profissional contratado.', onDone: () => router.push('/contratacoes') });
  const reject = useAction((pid: string) => post(`/proposals/${pid}/reject`), keys);
  const cancel = useAction(() => post(`/requests/${id}/cancel`), { ...keys, success: 'Pedido cancelado.' });
  const propose = useAction(async (form: FormData) => {
    const amount = Number(String(form.get('amount')).replace(',', '.'));
    try {
      await post(`/requests/${id}/proposals`, { amountCents: Math.round(amount * 100), message: form.get('message') });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PROPOSAL_LIMIT_REACHED') router.push('/planos');
      throw error;
    }
  }, { ...keys, success: 'Proposta enviada.' });

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const r = q.data;
  const isOwner = r.proposals !== undefined;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{r.title}</h1><StatusBadge status={r.status} /></div>
        <p className="text-muted-foreground mt-1 text-sm">
          {r.city} - {r.state}{r.budgetCents ? ` · orçamento de ${money(r.budgetCents)}` : ''}{r.urgent ? ' · urgente' : ''}
        </p>
        <p className="mt-3 whitespace-pre-wrap">{r.description}</p>
      </div>

      {isOwner ? (
        <section className="space-y-3">
          <h2 className="font-semibold">Propostas ({r.proposals!.length})</h2>
          {r.proposals!.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/profissionais/${p.professionalId}`} className="flex items-center gap-1 font-medium">
                    {p.displayName}{p.badge && <Crown className="size-4 text-amber-500" aria-label="Selo Premium" />}
                  </Link>
                  <b>{money(p.amountCents)}</b>
                </div>
                <p className="text-muted-foreground text-sm">{p.headline}{p.ratingAverage ? ` · nota ${p.ratingAverage.toFixed(1)}` : ''}</p>
                <p className="text-sm">{p.message}</p>
                {p.status === 'sent' && r.status === 'open' ? (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={accept.isPending} onClick={() => accept.mutate(p.id)}>Contratar</Button>
                    <Button size="sm" variant="outline" disabled={reject.isPending} onClick={() => reject.mutate(p.id)}>Recusar</Button>
                  </div>
                ) : <StatusBadge status={p.status} />}
              </CardContent>
            </Card>
          ))}
          {r.status === 'open' && <Button variant="outline" onClick={() => cancel.mutate()}>Cancelar pedido</Button>}
        </section>
      ) : (
        <>
          <p className="flex items-center gap-2 text-sm">
            {r.clientRatingLocked ? (
              <><Lock className="size-4" aria-hidden /> Nota do cliente disponível no <Link className="text-primary" href="/planos">plano Premium</Link></>
            ) : (
              <><Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
                {r.clientRating?.total ? `Nota do cliente: ${r.clientRating.average?.toFixed(1)} (${r.clientRating.total})` : 'Cliente ainda sem avaliações'}</>
            )}
          </p>
          {r.myProposal ? (
            <p className="text-sm">Sua proposta: <b>{money(r.myProposal.amountCents)}</b> <StatusBadge status={r.myProposal.status} /></p>
          ) : r.status === 'open' && (
            <Card>
              <CardHeader><CardTitle>Enviar proposta</CardTitle></CardHeader>
              <CardContent>
                <form action={(f) => propose.mutate(f)} className="space-y-3">
                  <div className="space-y-1"><Label htmlFor="amount">Valor em R$</Label><Input id="amount" name="amount" inputMode="decimal" required /></div>
                  <div className="space-y-1"><Label htmlFor="message">Mensagem</Label><Textarea id="message" name="message" minLength={5} maxLength={1000} required /></div>
                  <Button disabled={propose.isPending}>Enviar proposta</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
