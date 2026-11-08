'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ErrorState, Loading, pendingFor, post, StatusBadge, useAction } from '@/components/app-ui';
import { RecordHistory } from '@/components/audit';
import { ConfirmAction } from '@/components/confirm-action';
import { RoleControl } from '@/components/role-control';
import { useAccess } from '@/components/access-provider';
import { isStaffRole, ROLE_LABELS, type UserRole } from '@ergatis/shared';
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
  name: string; email: string; role: string; banned: boolean; banReason: string | null; twoFactorEnabled: boolean | null;
  access: { plan: string };
  subscriptions: { id: string; planCode: string; status: string; currentPeriodEnd: string | null }[];
  grants: Grant[];
}

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAccess();
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
  const resetTwoFactor = useAction((reason: string) => post(`/admin/users/${id}/two-factor/reset`, { reason }), { ...keys, success: 'Login em duas etapas redefinido. A pessoa foi avisada por e-mail.' });
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
        <p className="mt-1 flex flex-wrap gap-1.5">
          <Badge variant={isStaffRole(u.role) ? 'default' : 'secondary'}>{ROLE_LABELS[u.role as UserRole] ?? u.role}</Badge>
          <Badge variant={u.twoFactorEnabled ? 'default' : 'outline'}>{u.twoFactorEnabled ? 'Login em duas etapas ativo' : 'Sem login em duas etapas'}</Badge>
        </p>
        {can('admin.users', 'edit') && <div className="mt-3 flex flex-wrap gap-2">
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

          {u.twoFactorEnabled && (
            <ConfirmAction
              title={`Redefinir o login em duas etapas de ${u.name}?`}
              description={<>
                <p>Só para quem perdeu o celular e os códigos de recuperação, <b>depois de confirmar a identidade por outro meio</b> (documento, chamada de vídeo).</p>
                <p className="mt-2">A pessoa sai de todos os aparelhos, passa a entrar só com a senha e recebe um aviso por e-mail.</p>
              </>}
              confirmLabel="Redefinir" destructive
              reason={{ label: 'Como a identidade foi confirmada', required: true, minLength: 3, maxLength: 500, placeholder: 'Ex.: chamada de vídeo com documento em 08/11' }}
              onConfirm={(reason) => resetTwoFactor.mutateAsync(reason!)}
            >
              <Button size="sm" variant="outline">Redefinir login em duas etapas</Button>
            </ConfirmAction>
          )}
        </div>}
        <div className="mt-4"><RoleControl name={u.name} current={(u.role ?? 'user') as UserRole} onChange={(r) => role.mutateAsync(r)} /></div>
      </div>

      {can('grants.manage', 'edit') && <Card>
        <CardHeader><CardTitle>Conceder cortesia</CardTitle></CardHeader>
        <CardContent>
          <form action={(f) => grant.mutate(f)} className="grid gap-3 sm:grid-cols-[8rem_6rem_1fr_auto] sm:items-end">
            <div className="space-y-1"><Label htmlFor="planCode">Plano</Label><Select id="planCode" name="planCode" defaultValue="pro"><option value="pro">Profissional</option><option value="premium">Premium</option></Select></div>
            <div className="space-y-1"><Label htmlFor="days">Dias</Label><Input id="days" name="days" type="number" min={0} placeholder="Sempre" /></div>
            <div className="space-y-1"><Label htmlFor="reason">Motivo</Label><Input id="reason" name="reason" minLength={3} required /></div>
            <Button loading={grant.isPending}>Conceder</Button>
          </form>
        </CardContent>
      </Card>}

      <section>
        <h2 className="mb-2 font-semibold">Cortesias</h2>
        <ul className="divide-y rounded-lg border text-sm">
          {u.grants.length === 0 && <li className="text-muted-foreground p-3">Nenhuma.</li>}
          {u.grants.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 p-3">
              <span><b className="capitalize">{g.planCode ?? 'Benefício avulso'}</b> · {g.reason}<span className="text-muted-foreground block">{g.endsAt ? `Até ${date(g.endsAt)}` : 'Sem validade'}</span></span>
              {g.revokedAt ? <Badge variant="secondary">Revogada</Badge> : can('grants.manage', 'edit') && (
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

      <RecordHistory type="user" id={id} auditLink={can('admin.audit') ? `/admin/auditoria?userId=${id}` : undefined} />

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
