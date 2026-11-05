import type { Entitlements } from '@ergatis/shared';
import { Check, X } from 'lucide-react';
import type { Metadata } from 'next';
import { SubscribeButton } from '@/components/subscribe-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { money } from '@/lib/format';
import { publicGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Planos para profissionais' };

interface Plan { code: 'basic' | 'pro' | 'premium'; name: string; priceCents: number; entitlements: Entitlements }

const features = (e: Entitlements): [string, boolean][] => [
  [e.monthlyProposalLimit === null ? 'Propostas ilimitadas' : `Até ${e.monthlyProposalLimit} propostas por mês`, true],
  ['Serviços realizados no perfil', e.showCompletedServices],
  ['Destaque nas buscas', e.searchHighlight],
  ['Selo no perfil', e.badge],
  ['Ver a nota do cliente', e.viewClientRating],
];

export default async function Plans() {
  const plans = (await publicGet<Plan[]>('/billing/plans', 60)) ?? [];
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">Planos para profissionais</h1>
      <p className="text-muted-foreground mt-2">Quem contrata não paga nada. O pagamento do serviço é combinado direto entre cliente e profissional.</p>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.code} className={plan.code === 'premium' ? 'border-primary' : undefined}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <p className="text-2xl font-bold">{plan.priceCents === 0 ? 'Grátis' : <>{money(plan.priceCents)}<span className="text-muted-foreground text-sm font-normal">/mês</span></>}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                {features(plan.entitlements).map(([label, on]) => (
                  <li key={label} className={on ? 'flex gap-2' : 'text-muted-foreground flex gap-2'}>
                    {on ? <Check className="text-primary size-4 shrink-0" aria-hidden /> : <X className="size-4 shrink-0" aria-hidden />}
                    <span>{label}<span className="sr-only">{on ? ' (incluído)' : ' (não incluído)'}</span></span>
                  </li>
                ))}
              </ul>
              {plan.code !== 'basic' && <SubscribeButton planCode={plan.code} planName={plan.name} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
