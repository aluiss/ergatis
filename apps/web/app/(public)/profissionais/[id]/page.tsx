import { BadgeCheck, Crown, Star } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { date } from '@/lib/format';
import { publicGet } from '@/lib/server-api';

interface Profile {
  displayName: string; headline: string; bio: string | null; city: string | null; state: string | null;
  verified: boolean; badge: boolean;
  rating: { average: number | null; total: number };
  latestReviews: { rating: number; comment: string | null; createdAt: string }[];
  completedServices: { title: string; city: string; state: string; completedAt: string }[] | null;
}

const load = (id: string) =>
  /^[0-9a-f-]{36}$/i.test(id) ? publicGet<Profile>(`/professionals/${id}`) : Promise.resolve(null);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = await load((await params).id);
  return p ? { title: p.displayName, description: p.headline } : {};
}

export default async function ProfessionalPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await load((await params).id);
  if (!p) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          {p.displayName}
          {p.badge && <Crown className="size-6 text-amber-500" aria-label="Selo Premium" />}
          {p.verified && <BadgeCheck className="text-primary size-6" aria-label="Verificado" />}
        </h1>
        <p className="text-muted-foreground mt-1">{p.headline}</p>
        <p className="mt-2 text-sm">
          {[p.city, p.state].filter(Boolean).join(' - ')}
          {p.rating.total > 0 && ` · nota ${p.rating.average?.toFixed(1)} em ${p.rating.total} avaliação(ões)`}
        </p>
      </div>
      {p.bio && <p>{p.bio}</p>}

      {p.completedServices && (
        <Card>
          <CardHeader><CardTitle>Serviços realizados</CardTitle></CardHeader>
          <CardContent>
            {p.completedServices.length === 0 ? <p className="text-muted-foreground text-sm">Nenhum serviço concluído ainda.</p> : (
              <ul className="space-y-2 text-sm">
                {p.completedServices.map((s, i) => (
                  <li key={i} className="flex justify-between gap-4"><span>{s.title} ({s.city} - {s.state})</span><span className="text-muted-foreground shrink-0">{date(s.completedAt)}</span></li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Avaliações</CardTitle></CardHeader>
        <CardContent>
          {p.latestReviews.length === 0 ? <p className="text-muted-foreground text-sm">Ainda sem avaliações.</p> : (
            <ul className="space-y-3 text-sm">
              {p.latestReviews.map((r, i) => (
                <li key={i}>
                  <span className="flex items-center gap-1"><Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />{r.rating} · {date(r.createdAt)}</span>
                  {r.comment && <p className="text-muted-foreground mt-1">{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
