'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Empty, ErrorState, Loading, pendingFor, post, useAction } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

interface Me {
  profile: { displayName: string }; professional: object | null; plan: string; proposalsUsed: number;
  entitlements: { monthlyProposalLimit: number | null };
}
interface Notification { id: string; title: string; link: string | null; readAt: string | null; createdAt: string }

export default function Panel() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me') });
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: () => api<Notification[]>('/notifications') });
  const read = useAction((id: string) => post(`/notifications/${id}/read`), { invalidate: ['notifications', 'unread'] });

  if (me.isPending) return <Loading />;
  if (me.error) return <ErrorState error={me.error} />;
  const limit = me.data.entitlements.monthlyProposalLimit;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Olá, {me.data.profile.displayName.split(' ')[0]}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Preciso de um serviço</CardTitle></CardHeader>
          <CardContent><Button asChild><Link href="/pedidos/novo">Publicar pedido</Link></Button></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Sou profissional</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {me.data.professional ? (
              <>
                <p>Plano atual: <b className="capitalize">{me.data.plan}</b></p>
                <p>Propostas neste mês: {me.data.proposalsUsed}{limit === null ? ' (sem limite)' : ` de ${limit}`}</p>
                <Button asChild variant="outline"><Link href="/oportunidades">Ver oportunidades</Link></Button>
              </>
            ) : <Button asChild variant="outline"><Link href="/perfil">Criar perfil profissional</Link></Button>}
          </CardContent>
        </Card>
      </div>
      <section>
        <h2 className="mb-3 font-semibold">Notificações</h2>
        {notifications.data?.length ? (
          <ul className="divide-y rounded-lg border">
            {notifications.data.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className={n.readAt ? 'text-muted-foreground' : 'font-medium'}>
                  {n.link ? <Link href={n.link}>{n.title}</Link> : n.title}
                  <span className="text-muted-foreground block text-xs font-normal">{date(n.createdAt)}</span>
                </span>
                {!n.readAt && <Button size="sm" variant="ghost" loading={pendingFor(read, (v) => v === n.id)} onClick={() => read.mutate(n.id)}>Marcar como lida</Button>}
              </li>
            ))}
          </ul>
        ) : <Empty>Nenhuma notificação por enquanto.</Empty>}
      </section>
    </div>
  );
}
