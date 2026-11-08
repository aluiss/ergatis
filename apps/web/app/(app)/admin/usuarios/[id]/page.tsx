'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ErrorState, Loading, pendingFor, post, StatusBadge, useAction } from '@/components/app-ui';
import { AuditHistory } from '@/components/audit';
import { ConfirmAction } from '@/components/confirm-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

interface Grant { id: string; planCode: string | null; reason: string; endsAt: string | null; revokedAt: string | null; createdAt: string }
interface Detail {
  name: string; email: string; role: string; banned: boolean; banReason: string | null;
  access: { plan: string };
  subscriptions: { id: string; planCode: string; status: string; currentPeriodEnd: string | null }[];
  grants: Grant[];
}

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['admin-user', id], queryFn: () => api<Detail>(`/admin/users/${id}`) });
  const keys = { invalidate: ['admin-user', 'admin-users'] };

  const grant = useAction((f: FormData) => {
    const days = Number(f.get('days'));
    return post('/admin/grants', {
      userId: id, planCode: f.get('planCode'), reason: f.get('reason'),
      endsAt: days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : undefined,
    });
  }, { ...keys, success: 'Cortesia concedida.' });
  const revoke = useAction((gid: string) => api(`/admin/grants/${gid}`, { method: 'DELETE' }), { ...keys, success: 'Cortesia revogada.' });
  const ban = useAction((reason: string) => post(`/admin/users/${id}/ban`, { reason }), { ...keys, success: 'Usuário banido.' });
  const unban = useAction(() => post(`/admin/users/${id}/unban`), { ...keys, success: 'Banimento removido.' });
  const role = useAction((r: string) => post(`/admin/users/${id}/role`, { role: r }), { ...keys, success: 'Papel alterado.' });

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const u = q.data;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{u.name}</h1>
        <p className="text-muted-foreground text-sm">{u.email} · plano efetivo: <b className="capitalize">{u.access.plan}</b></p>
        {u.banned && <p className="text-destructive mt-1 text-sm">Banido: {u.banReason}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {u.banned ? (
            <ConfirmAction
              title={`Remover o banimento de ${u.name}?`}
              description="A pessoa volta a entrar na plataforma e a usar todos os recursos do plano dela."
              confirmLabel="Remover banimento"
              onConfirm={() => unban.mutateAsync()}
            >
              <Button size="sm" variant="outline">Remover banimento</Button>
            </ConfirmAction>
          ) : (
            <ConfirmAction
              title={`Banir ${u.name}?`}
              description="A pessoa sai na hora de todos os aparelhos e não consegue mais entrar. O motivo fica na auditoria."
              confirmLabel="Banir" destructive
              reason={{ label: 'Motivo do banimento', required: true, minLength: 3, maxLength: 500, placeholder: 'Ex.: fraude em pagamentos, assédio a clientes' }}
              onConfirm={(reason) => ban.mutateAsync(reason!)}
            >
              <Button size="sm" variant="destructive">Banir</Button>
            </ConfirmAction>
          )}
          <ConfirmAction
            title={u.role === 'admin' ? `Remover ${u.name} da administração?` : `Tornar ${u.name} admin?`}
            description={u.role === 'admin'
              ? 'A pessoa perde o acesso ao painel de administração.'
              : 'A pessoa passa a ver dados de todos os usuários, banir contas, conceder cortesias e alterar preços dos planos.'}
            confirmLabel={u.role === 'admin' ? 'Remover admin' : 'Tornar admin'} destructive={u.role !== 'admin'}
            onConfirm={() => role.mutateAsync(u.role === 'admin' ? 'user' : 'admin')}
          >
            <Button size="sm" variant="outline">{u.role === 'admin' ? 'Remover admin' : 'Tornar admin'}</Button>
          </ConfirmAction>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Conceder cortesia</CardTitle></CardHeader>
        <CardContent>
          <form action={(f) => grant.mutate(f)} className="grid gap-3 sm:grid-cols-[8rem_6rem_1fr_auto] sm:items-end">
            <div className="space-y-1"><Label htmlFor="planCode">Plano</Label><Select id="planCode" name="planCode" defaultValue="pro"><option value="pro">Profissional</option><option value="premium">Premium</option></Select></div>
            <div className="space-y-1"><Label htmlFor="days">Dias</Label><Input id="days" name="days" type="number" min={0} placeholder="Sempre" /></div>
            <div className="space-y-1"><Label htmlFor="reason">Motivo</Label><Input id="reason" name="reason" minLength={3} required /></div>
            <Button loading={grant.isPending}>Conceder</Button>
          </form>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-2 font-semibold">Cortesias</h2>
        <ul className="divide-y rounded-lg border text-sm">
          {u.grants.length === 0 && <li className="text-muted-foreground p-3">Nenhuma.</li>}
          {u.grants.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 p-3">
              <span><b className="capitalize">{g.planCode ?? 'Benefício avulso'}</b> · {g.reason}<span className="text-muted-foreground block">{g.endsAt ? `Até ${date(g.endsAt)}` : 'Sem validade'}</span></span>
              {g.revokedAt ? <Badge variant="secondary">Revogada</Badge> : (
                <ConfirmAction
                  title="Revogar esta cortesia?"
                  description={`Os benefícios de "${g.planCode ?? 'benefício avulso'}" deixam de valer na hora.`}
                  confirmLabel="Revogar" destructive
                  onConfirm={() => revoke.mutateAsync(g.id)}
                >
                  <Button size="sm" variant="outline" loading={pendingFor(revoke, (v) => v === g.id)}>Revogar</Button>
                </ConfirmAction>
              )}
            </li>
          ))}
        </ul>
      </section>

      <AuditHistory userId={id} />

      <section>
        <h2 className="mb-2 font-semibold">Assinaturas</h2>
        <ul className="divide-y rounded-lg border text-sm">
          {u.subscriptions.length === 0 && <li className="text-muted-foreground p-3">Nenhuma.</li>}
          {u.subscriptions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 p-3">
              <span className="capitalize">{s.planCode}{s.currentPeriodEnd ? ` · até ${date(s.currentPeriodEnd)}` : ''}</span>
              <StatusBadge status={s.status} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
