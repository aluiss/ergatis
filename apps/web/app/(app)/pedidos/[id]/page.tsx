'use client';

import { useQuery } from '@tanstack/react-query';
import { Crown, Lock, ScanFace, ShieldAlert, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { VerificationStatusView } from '@ergatis/shared';
import { FaceCheckDialog } from '@/components/face-check';
import { ErrorState, Loading, pendingFor, post, StatusBadge, useAction } from '@/components/app-ui';
import { ConfirmAction } from '@/components/confirm-action';
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
  const verification = useQuery({
    queryKey: ['verification'], queryFn: () => api<VerificationStatusView>('/verification/me'),
    enabled: q.data !== undefined && q.data.proposals === undefined,
  });
  const pending = useRef<FormData | null>(null);
  const [faceOpen, setFaceOpen] = useState(false);
  const propose = useAction(async ({ form, faceCheckId }: { form: FormData; faceCheckId?: string }) => {
    const amount = Number(String(form.get('amount')).replace(',', '.'));
    try {
      await post(`/requests/${id}/proposals`, { amountCents: Math.round(amount * 100), message: form.get('message'), faceCheckId });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PROPOSAL_LIMIT_REACHED') router.push('/planos');
      // A checagem venceu ou não valia: pede outra na hora, sem perder o que foi digitado.
      if (error instanceof ApiError && error.code === 'FACE_CHECK_REQUIRED') { pending.current = form; setFaceOpen(true); }
      throw error;
    }
  }, { ...keys, invalidate: [...keys.invalidate, 'verification'], success: 'Proposta enviada.' });

  /** Com checagem facial exigida, o envio passa antes pela confirmação do rosto. */
  function submitProposal(form: FormData) {
    if (verification.data?.faceCheckRequired) { pending.current = form; setFaceOpen(true); return; }
    propose.mutate({ form });
  }

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
                    <ConfirmAction
                      title={`Contratar ${p.displayName} por ${money(p.amountCents)}?`}
                      description={r.proposals!.filter((o) => o.status === 'sent').length > 1
                        ? 'As outras propostas deste pedido serão recusadas, e os profissionais, avisados. Vocês poderão conversar pelas mensagens.'
                        : 'O pedido sai da lista de oportunidades. Vocês poderão conversar pelas mensagens.'}
                      confirmLabel="Contratar"
                      onConfirm={() => accept.mutateAsync(p.id)}
                    >
                      <Button size="sm" loading={pendingFor(accept, (v) => v === p.id)} disabled={accept.isPending}>Contratar</Button>
                    </ConfirmAction>
                    <ConfirmAction
                      title={`Recusar a proposta de ${p.displayName}?`}
                      description="O profissional será avisado. Não dá para reconsiderar depois."
                      confirmLabel="Recusar proposta" destructive
                      onConfirm={() => reject.mutateAsync(p.id)}
                    >
                      <Button size="sm" variant="outline" loading={pendingFor(reject, (v) => v === p.id)} disabled={accept.isPending}>Recusar</Button>
                    </ConfirmAction>
                  </div>
                ) : <StatusBadge status={p.status} />}
              </CardContent>
            </Card>
          ))}
          {r.status === 'open' && (
            <ConfirmAction
              title="Cancelar este pedido?"
              description="Ele sai da lista de oportunidades, e quem enviou proposta será avisado. Para retomar, será preciso publicar outro pedido."
              confirmLabel="Cancelar pedido" destructive
              onConfirm={() => cancel.mutateAsync()}
            >
              <Button variant="outline" className="w-full sm:w-auto">Cancelar pedido</Button>
            </ConfirmAction>
          )}
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
          ) : r.status === 'open' && verification.data && !verification.data.canPropose ? (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="size-5 text-amber-600" aria-hidden /> Verificação necessária</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>{verification.data.blockedReason}</p>
                <Button asChild className="h-11 w-full sm:w-auto"><Link href="/perfil#verificacao">Verificar minha identidade</Link></Button>
              </CardContent>
            </Card>
          ) : r.status === 'open' && (
            <Card>
              <CardHeader><CardTitle>Enviar proposta</CardTitle></CardHeader>
              <CardContent>
                <form action={submitProposal} className="space-y-3">
                  <div className="space-y-1"><Label htmlFor="amount">Valor em R$</Label><Input id="amount" name="amount" inputMode="decimal" required /></div>
                  <div className="space-y-1"><Label htmlFor="message">Mensagem</Label><Textarea id="message" name="message" minLength={5} maxLength={1000} required /></div>
                  <Button loading={propose.isPending} className="w-full sm:w-auto">
                    {verification.data?.faceCheckRequired && <ScanFace />} Enviar proposta
                  </Button>
                  {verification.data?.faceCheckRequired && (
                    <p className="text-muted-foreground text-xs">Antes de enviar, confirmamos que é você com o reconhecimento facial.</p>
                  )}
                </form>
                <FaceCheckDialog
                  open={faceOpen} onOpenChange={setFaceOpen} purpose="proposal" requestId={id}
                  title="Confirme que é você" description="Uma selfie rápida para proteger os clientes de contas falsas."
                  onPassed={(faceCheckId) => { if (pending.current) propose.mutate({ form: pending.current, faceCheckId }); }}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
