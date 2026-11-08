'use client';

import type { Entitlements } from '@ergatis/shared';
import { useQuery } from '@tanstack/react-query';
import { ErrorState, Loading, useAction } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

interface Plan { code: string; name: string; priceCents: number; entitlements: Entitlements }
const FLAGS = [
  ['showCompletedServices', 'Exibe serviços realizados'], ['searchHighlight', 'Destaque nas buscas'],
  ['badge', 'Selo'], ['viewClientRating', 'Vê a nota do cliente'],
] as const;

function PlanForm({ plan }: { plan: Plan }) {
  const save = useAction((f: FormData) => {
    const limit = String(f.get('limit')).trim();
    return api(`/admin/plans/${plan.code}`, { method: 'PATCH', body: {
      name: f.get('name'),
      priceCents: Math.round(Number(String(f.get('price')).replace(',', '.')) * 100),
      entitlements: {
        monthlyProposalLimit: limit === '' ? null : Number(limit),
        ...Object.fromEntries(FLAGS.map(([k]) => [k, f.get(k) === 'on'])),
      },
    } });
  }, { invalidate: ['admin-plans'], success: 'Plano salvo.' });

  return (
    <Card>
      <CardHeader><CardTitle className="capitalize">{plan.code}</CardTitle></CardHeader>
      <CardContent>
        <form action={(f) => save.mutate(f)} className="space-y-3">
          <div className="space-y-1"><Label htmlFor={`n-${plan.code}`}>Nome</Label><Input id={`n-${plan.code}`} name="name" defaultValue={plan.name} required /></div>
          <div className="space-y-1"><Label htmlFor={`p-${plan.code}`}>Preço mensal em R$</Label><Input id={`p-${plan.code}`} name="price" inputMode="decimal" defaultValue={(plan.priceCents / 100).toFixed(2)} required /></div>
          <div className="space-y-1"><Label htmlFor={`l-${plan.code}`}>Propostas por mês (vazio = sem limite)</Label><Input id={`l-${plan.code}`} name="limit" type="number" min={0} defaultValue={plan.entitlements.monthlyProposalLimit ?? ''} /></div>
          {FLAGS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" name={key} defaultChecked={plan.entitlements[key]} /> {label}</label>
          ))}
          <Button loading={save.isPending}>Salvar</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AdminPlans() {
  const q = useQuery({ queryKey: ['admin-plans'], queryFn: () => api<Plan[]>('/admin/plans') });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">Novo preço vale para novas assinaturas. Assinaturas existentes mantêm o valor cobrado no gateway.</p>
      <div className="grid gap-4 lg:grid-cols-3">{q.data.map((p) => <PlanForm key={p.code} plan={p} />)}</div>
    </div>
  );
}
